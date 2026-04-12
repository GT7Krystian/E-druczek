import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  KsefStatus,
  DocumentClass,
  VatRate,
  InvoiceTarget,
} from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { XmlGeneratorService } from '../../xml/xml-generator.service';
import { XmlInvoiceInput } from '../../xml/xml-generator.types';
import { DlqService } from '../dlq.service';
import { createHash } from 'crypto';

export interface GenerateXmlJobData {
  documentId: string;
}

@Processor('generate-xml')
export class GenerateXmlProcessor {
  private readonly logger = new Logger(GenerateXmlProcessor.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly xmlGenerator: XmlGeneratorService,
    private readonly dlq: DlqService,
    @InjectQueue('validate-xsd') private readonly validateXsdQueue: Queue,
  ) {}

  @Process()
  async handle(job: Job<GenerateXmlJobData>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Generating XML for document ${documentId}`);

    try {
      // 1. Fetch document + items + company
      const { data: doc, error: docErr } = await this.supabase
        .from('documents')
        .select('*, document_items(*)')
        .eq('id', documentId)
        .single();
      if (docErr || !doc) throw new Error(`Document not found: ${documentId}`);

      const { data: company, error: compErr } = await this.supabase
        .from('companies')
        .select('*')
        .eq('id', doc.company_id)
        .single();
      if (compErr || !company) throw new Error(`Company not found: ${doc.company_id}`);

      // 2. Build XmlInvoiceInput from DB data
      const items = (doc.document_items ?? [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order);

      const xmlInput: XmlInvoiceInput = {
        documentClass: doc.document_class ?? DocumentClass.FAKTURA_PIERWOTNA,
        invoiceNumber: doc.invoice_number ?? `FV/${doc.id.slice(0, 8)}`,
        issueDate: doc.issue_date ?? new Date().toISOString().slice(0, 10),
        seller: {
          nip: company.nip,
          name: company.name,
          address: {
            countryCode: 'PL',
            addressLine1: company.address_line1 ?? company.name,
            addressLine2: company.address_line2,
          },
        },
        buyer: this.buildBuyer(doc),
        items: items.map((it: any) => ({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          unitPriceNet: it.unit_price_net,
          vatRate: it.vat_rate as VatRate,
          totalNet: it.total_net,
          totalVat: it.total_vat,
          totalGross: it.total_gross,
          vatExemptionNode: it.vat_exemption_node ?? undefined,
          vatExemptionText: it.vat_exemption_text ?? undefined,
        })),
        totalGross: doc.amount_gross,
      };

      // Compute VAT aggregates
      const vatItems = items.filter((it: any) => it.vat_rate === VatRate.RATE_23);
      if (vatItems.length > 0) {
        xmlInput.totalNet23 = vatItems.reduce((s: number, it: any) => s + it.total_net, 0);
        xmlInput.totalVat23 = vatItems.reduce((s: number, it: any) => s + it.total_vat, 0);
      }
      const exemptItems = items.filter(
        (it: any) => it.vat_rate === VatRate.ZW || it.vat_rate === 'np',
      );
      if (exemptItems.length > 0) {
        xmlInput.totalExempt = exemptItems.reduce((s: number, it: any) => s + it.total_net, 0);
      }

      // Correction reference
      if (
        doc.document_class === DocumentClass.FAKTURA_KORYGUJACA &&
        doc.original_ksef_reference_number
      ) {
        xmlInput.originalInvoice = {
          issueDate: doc.original_issue_date ?? doc.issue_date,
          invoiceNumber: doc.original_invoice_number ?? 'N/A',
          ksefReferenceNumber: doc.original_was_in_ksef
            ? doc.original_ksef_reference_number
            : undefined,
        };
      }

      // 3. Generate XML
      const xml = this.xmlGenerator.generate(xmlInput);
      const xmlHash = createHash('sha256')
        .update(Buffer.from(xml, 'utf-8'))
        .digest('hex');

      // 4. Upload XML to Supabase Storage
      const storagePath = `invoices/${doc.company_id}/${documentId}.xml`;
      const { error: uploadErr } = await this.supabase.storage
        .from('documents')
        .upload(storagePath, Buffer.from(xml, 'utf-8'), {
          contentType: 'application/xml',
          upsert: true,
        });
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      // 5. Update document with XML metadata
      const { error: updateErr } = await this.supabase
        .from('documents')
        .update({
          xml_url: storagePath,
          xml_hash: xmlHash,
          xml_schema_version: 'FA(3) 1-0E',
          xml_generator_version: 'e-druczek-xml/0.1.0',
        })
        .eq('id', documentId);
      if (updateErr) throw new Error(`Document update failed: ${updateErr.message}`);

      this.logger.log(`XML generated for ${documentId} (${xml.length} bytes)`);

      // 6. Enqueue next step
      await this.validateXsdQueue.add({ documentId }, { attempts: 1 });
    } catch (err) {
      const error = err as Error;
      this.logger.error(`generate-xml failed for ${documentId}: ${error.message}`);

      await this.updateStatus(documentId, KsefStatus.SEND_FAILED);
      await this.dlq.record({
        document_id: documentId,
        queue_name: 'generate-xml',
        job_id: String(job.id),
        step: 'generate-xml',
        error_message: error.message,
        error_stack: error.stack,
        retry_count: job.attemptsMade,
      });
      throw err;
    }
  }

  private buildBuyer(doc: any) {
    return {
      nip: doc.buyer_nip ?? undefined,
      name: doc.buyer_name ?? 'Nabywca',
      address: doc.buyer_address_line1
        ? {
            countryCode: doc.buyer_country_code ?? 'PL',
            addressLine1: doc.buyer_address_line1,
            addressLine2: doc.buyer_address_line2,
          }
        : undefined,
    };
  }

  private async updateStatus(documentId: string, status: KsefStatus) {
    await this.supabase
      .from('documents')
      .update({ ksef_status: status })
      .eq('id', documentId);
  }
}
