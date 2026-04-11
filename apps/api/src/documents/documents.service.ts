import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { Document, KsefStatus, InvoiceTarget } from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async findAllForUser(userId: string): Promise<Document[]> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*, companies!inner(user_id)')
      .eq('companies.user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Document[];
  }

  async findOne(id: string, userId: string): Promise<Document> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*, companies!inner(user_id), document_items(*)')
      .eq('id', id)
      .eq('companies.user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException(`Document ${id} not found`);
    return data as Document;
  }

  async create(userId: string, dto: CreateDocumentDto): Promise<Document> {
    // Verify company belongs to user
    const { data: company, error: companyErr } = await this.supabase
      .from('companies')
      .select('id, user_id')
      .eq('id', dto.company_id)
      .maybeSingle();
    if (companyErr) throw companyErr;
    if (!company) throw new NotFoundException(`Company ${dto.company_id} not found`);
    if (company.user_id !== userId) {
      throw new ForbiddenException('Company does not belong to user');
    }

    // B2C → never goes to KSeF (LOCAL_ONLY)
    const ksef_status =
      dto.invoice_target === InvoiceTarget.B2C ? KsefStatus.LOCAL_ONLY : KsefStatus.DRAFT;

    const { items, ...header } = dto;

    const { data: doc, error: docErr } = await this.supabase
      .from('documents')
      .insert({ ...header, ksef_status })
      .select()
      .single();
    if (docErr) throw docErr;

    const itemsPayload = items.map((it, idx) => ({
      ...it,
      document_id: doc.id,
      sort_order: idx,
    }));
    const { error: itemsErr } = await this.supabase
      .from('document_items')
      .insert(itemsPayload);
    if (itemsErr) throw itemsErr;

    return doc as Document;
  }
}
