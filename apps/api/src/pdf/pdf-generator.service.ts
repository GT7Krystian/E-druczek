import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { parseStringPromise } from 'xml2js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

export interface PdfGenerateResult {
  pdfStoragePath: string;
}

/**
 * Generates a PDF invoice from XML stored in Supabase Storage.
 * PDF is always generated from XML — never from DB data (source of truth rule).
 * Includes two QR codes for Offline24 compliance.
 */
@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  // Embedded font-compatible replacements for Polish characters
  private readonly GREEN = '#16a34a';
  private readonly DARK = '#111827';
  private readonly GRAY = '#6b7280';
  private readonly LIGHT_GRAY = '#f9fafb';
  private readonly BORDER = '#e5e7eb';

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async generateFromStorage(
    documentId: string,
    xmlStoragePath: string,
  ): Promise<PdfGenerateResult> {
    // 1. Download XML
    const { data: blob, error: dlErr } = await this.supabase.storage
      .from('documents')
      .download(xmlStoragePath);
    if (dlErr || !blob) throw new Error(`XML download failed: ${dlErr?.message}`);
    const xml = await blob.text();

    // 2. Parse XML → invoice data
    const invoice = await this.parseInvoiceXml(xml);

    // 3. Generate PDF buffer
    const pdfBuffer = await this.renderPdf(invoice, documentId);

    // 4. Upload PDF to storage
    const pdfPath = `invoices/${documentId}.pdf`;
    const { error: uploadErr } = await this.supabase.storage
      .from('documents')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadErr) throw new Error(`PDF upload failed: ${uploadErr.message}`);

    this.logger.log(`PDF generated for ${documentId} (${pdfBuffer.length} bytes)`);
    return { pdfStoragePath: pdfPath };
  }

  // ─── XML parsing ────────────────────────────────────────────────────────────

  private async parseInvoiceXml(xml: string): Promise<InvoiceData> {
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    // Handle both namespaced and plain root element
    const root =
      parsed['fa:Faktura'] ??
      parsed['Faktura'] ??
      Object.values(parsed)[0] as any;

    const fa = root?.['fa:Fa'] ?? root?.Fa ?? root;
    const podmiot1 = fa?.['fa:Podmiot1'] ?? fa?.Podmiot1 ?? {};
    const podmiot2 = fa?.['fa:Podmiot2'] ?? fa?.Podmiot2 ?? {};

    const p1 = podmiot1?.['fa:DaneIdentyfikacyjne'] ?? podmiot1?.DaneIdentyfikacyjne ?? {};
    const p1addr = podmiot1?.['fa:Adres'] ?? podmiot1?.Adres ?? {};
    const p2 = podmiot2?.['fa:DaneIdentyfikacyjne'] ?? podmiot2?.DaneIdentyfikacyjne ?? {};
    const p2addr = podmiot2?.['fa:Adres'] ?? podmiot2?.Adres ?? {};

    const fa2 = fa?.['fa:Fa'] ?? fa;
    const wiersze = this.toArray(fa2?.['fa:FaWiersz'] ?? fa2?.FaWiersz ?? []);
    const platnosc = fa2?.['fa:Platnosc'] ?? fa2?.Platnosc ?? {};
    const rozliczenie = fa2?.['fa:Rozliczenie'] ?? fa2?.Rozliczenie ?? {};

    const getVal = (obj: any, ...keys: string[]) => {
      for (const k of keys) {
        const v = obj?.[`fa:${k}`] ?? obj?.[k];
        if (v !== undefined) return String(v);
      }
      return '';
    };

    const items: InvoiceItem[] = wiersze.map((w: any) => ({
      lp: getVal(w, 'NrWiersza') || '1',
      name: getVal(w, 'P_7'),
      quantity: parseFloat(getVal(w, 'P_8A') || '1'),
      unit: getVal(w, 'P_8B') || 'szt',
      unitPriceNet: parseFloat(getVal(w, 'P_9A') || '0'),
      totalNet: parseFloat(getVal(w, 'P_11A', 'P_11') || '0'),
      vatRate: getVal(w, 'P_12'),
      totalVat: parseFloat(getVal(w, 'P_14A', 'P_14') || '0'),
      totalGross: parseFloat(getVal(w, 'P_15') || '0'),
    }));

    return {
      number: getVal(fa2 ?? fa, 'P_2') || getVal(fa, 'P_2'),
      issueDate: getVal(fa2 ?? fa, 'P_1') || getVal(fa, 'P_1'),
      currencyCode: getVal(fa2 ?? fa, 'P_5') || 'PLN',
      sellerNip: getVal(p1, 'NIP'),
      sellerName: getVal(p1, 'PelnaNazwa'),
      sellerAddress: `${getVal(p1addr, 'Ulica')} ${getVal(p1addr, 'NrDomu')}, ${getVal(p1addr, 'KodPocztowy')} ${getVal(p1addr, 'Miejscowosc')}`.trim(),
      buyerNip: getVal(p2, 'NIP'),
      buyerName: getVal(p2, 'PelnaNazwa'),
      buyerAddress: `${getVal(p2addr, 'Ulica')} ${getVal(p2addr, 'NrDomu')}, ${getVal(p2addr, 'KodPocztowy')} ${getVal(p2addr, 'Miejscowosc')}`.trim(),
      items,
      totalNet: parseFloat(getVal(rozliczenie, 'TotalPodatekNetto', 'TotalNetto') || '0'),
      totalVat: parseFloat(getVal(rozliczenie, 'TotalPodatek', 'TotalVat') || '0'),
      totalGross: parseFloat(getVal(platnosc, 'TotalZaplata', 'P_15') || '0'),
      ksefNumber: getVal(root, 'NrKSeF') || '',
    };
  }

  private toArray(val: any): any[] {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  }

  // ─── PDF rendering ───────────────────────────────────────────────────────────

  private async renderPdf(inv: InvoiceData, documentId: string): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Faktura ${inv.number}` } });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = 515; // usable width
      const COL = 40; // left margin

      // ─── Header ──────────────────────────────────────────
      doc.fontSize(20).fillColor(this.DARK).font('Helvetica-Bold')
        .text('e-', COL, 40, { continued: true })
        .fillColor(this.GREEN).text('druczek');

      doc.fontSize(22).fillColor(this.DARK).font('Helvetica-Bold')
        .text(`Faktura VAT`, COL, 40, { align: 'right' });

      doc.fontSize(11).fillColor(this.GRAY).font('Helvetica')
        .text(`Nr: ${inv.number}`, COL, 68, { align: 'right' });
      doc.fontSize(10).fillColor(this.GRAY)
        .text(`Data wystawienia: ${inv.issueDate}`, COL, 82, { align: 'right' });

      doc.moveTo(COL, 100).lineTo(COL + W, 100).strokeColor(this.BORDER).lineWidth(1).stroke();

      // ─── Seller / Buyer ───────────────────────────────────
      const colW = (W - 20) / 2;
      doc.y = 115;

      // Seller box
      doc.rect(COL, doc.y, colW, 90).fillColor(this.LIGHT_GRAY).fill();
      doc.fillColor(this.GRAY).fontSize(8).font('Helvetica-Bold')
        .text('SPRZEDAWCA', COL + 8, doc.y + 6);
      doc.fillColor(this.DARK).fontSize(10).font('Helvetica-Bold')
        .text(inv.sellerName, COL + 8, doc.y + 18, { width: colW - 16 });
      doc.fillColor(this.GRAY).fontSize(9).font('Helvetica')
        .text(`NIP: ${inv.sellerNip}`, COL + 8, doc.y + 34, { width: colW - 16 })
        .text(inv.sellerAddress, COL + 8, doc.y + 46, { width: colW - 16 });

      // Buyer box
      const buyerX = COL + colW + 20;
      doc.rect(buyerX, 115, colW, 90).fillColor(this.LIGHT_GRAY).fill();
      doc.fillColor(this.GRAY).fontSize(8).font('Helvetica-Bold')
        .text('NABYWCA', buyerX + 8, 121);
      doc.fillColor(this.DARK).fontSize(10).font('Helvetica-Bold')
        .text(inv.buyerName, buyerX + 8, 133, { width: colW - 16 });
      doc.fillColor(this.GRAY).fontSize(9).font('Helvetica')
        .text(inv.buyerNip ? `NIP: ${inv.buyerNip}` : '', buyerX + 8, 149, { width: colW - 16 })
        .text(inv.buyerAddress, buyerX + 8, 161, { width: colW - 16 });

      doc.y = 220;

      // ─── Items table ──────────────────────────────────────
      const cols = { lp: 25, name: 160, qty: 50, unit: 35, price: 65, net: 65, vat: 45, gross: 65 };
      const headers = ['Lp', 'Nazwa', 'Ilość', 'J.m.', 'Cena netto', 'Wartość netto', 'VAT', 'Brutto'];
      const colX = [
        COL,
        COL + cols.lp,
        COL + cols.lp + cols.name,
        COL + cols.lp + cols.name + cols.qty,
        COL + cols.lp + cols.name + cols.qty + cols.unit,
        COL + cols.lp + cols.name + cols.qty + cols.unit + cols.price,
        COL + cols.lp + cols.name + cols.qty + cols.unit + cols.price + cols.net,
        COL + cols.lp + cols.name + cols.qty + cols.unit + cols.price + cols.net + cols.vat,
      ];
      const colWidths = [cols.lp, cols.name, cols.qty, cols.unit, cols.price, cols.net, cols.vat, cols.gross];

      // Table header
      doc.rect(COL, doc.y, W, 18).fillColor('#f3f4f6').fill();
      headers.forEach((h, i) => {
        doc.fillColor(this.DARK).fontSize(8).font('Helvetica-Bold')
          .text(h, colX[i] + 3, doc.y + 5, { width: colWidths[i] - 6, align: i > 1 ? 'right' : 'left' });
      });
      doc.y += 18;

      // Table rows
      inv.items.forEach((item, idx) => {
        const rowY = doc.y;
        const bg = idx % 2 === 0 ? '#ffffff' : this.LIGHT_GRAY;
        doc.rect(COL, rowY, W, 16).fillColor(bg).fill();

        const vatLabel = item.vatRate === 'zw' ? 'ZW' : item.vatRate === 'np' ? 'NP' : `${item.vatRate}%`;
        const vals = [
          item.lp,
          item.name,
          String(item.quantity),
          item.unit,
          this.fmtNum(item.unitPriceNet),
          this.fmtNum(item.totalNet),
          vatLabel,
          this.fmtNum(item.totalGross),
        ];
        vals.forEach((v, i) => {
          doc.fillColor(this.DARK).fontSize(8).font('Helvetica')
            .text(v, colX[i] + 3, rowY + 4, { width: colWidths[i] - 6, align: i > 1 ? 'right' : 'left' });
        });
        doc.y += 16;
      });

      // Table border
      doc.rect(COL, 220, W, doc.y - 220).strokeColor(this.BORDER).lineWidth(0.5).stroke();

      doc.y += 8;

      // ─── Totals ───────────────────────────────────────────
      const totX = COL + W - 180;
      doc.rect(totX, doc.y, 180, 56).fillColor(this.LIGHT_GRAY).fill();
      doc.fillColor(this.GRAY).fontSize(9).font('Helvetica')
        .text('Razem netto:', totX + 8, doc.y + 8, { width: 100 })
        .text('Razem VAT:', totX + 8, doc.y + 22, { width: 100 })
      doc.fillColor(this.DARK).fontSize(12).font('Helvetica-Bold')
        .text('Do zapłaty:', totX + 8, doc.y + 36, { width: 100 });

      const totValX = totX + 110;
      const savedY = doc.y;
      doc.fillColor(this.DARK).fontSize(9).font('Helvetica')
        .text(`${this.fmtNum(inv.totalNet)} ${inv.currencyCode}`, totValX, savedY + 8, { width: 60, align: 'right' })
        .text(`${this.fmtNum(inv.totalVat)} ${inv.currencyCode}`, totValX, savedY + 22, { width: 60, align: 'right' });
      doc.fillColor(this.GREEN).fontSize(12).font('Helvetica-Bold')
        .text(`${this.fmtNum(inv.totalGross)} ${inv.currencyCode}`, totValX, savedY + 36, { width: 60, align: 'right' });

      doc.y = savedY + 68;

      // ─── KSeF number ──────────────────────────────────────
      if (inv.ksefNumber) {
        doc.rect(COL, doc.y, W, 24).fillColor('#dcfce7').fill();
        doc.fillColor('#15803d').fontSize(8).font('Helvetica-Bold')
          .text('Numer KSeF:', COL + 8, doc.y + 4)
          .fontSize(8).font('Helvetica')
          .text(inv.ksefNumber, COL + 70, doc.y + 4, { width: W - 78 });
        doc.y += 30;
      }

      // ─── QR codes ─────────────────────────────────────────
      try {
        const qrData1 = inv.ksefNumber
          ? `https://ksef.mf.gov.pl/weryfikuj/${inv.ksefNumber}`
          : `e-druczek:invoice:${documentId}`;
        const qrData2 = `e-druczek:verify:${documentId}:${inv.number}`;

        const [qr1, qr2] = await Promise.all([
          QRCode.toBuffer(qrData1, { width: 80, margin: 1, errorCorrectionLevel: 'M' }),
          QRCode.toBuffer(qrData2, { width: 80, margin: 1, errorCorrectionLevel: 'M' }),
        ]);

        doc.y += 10;
        doc.fillColor(this.GRAY).fontSize(7).font('Helvetica')
          .text('Weryfikacja KSeF', COL, doc.y);
        doc.image(qr1, COL, doc.y + 10, { width: 70 });

        doc.fillColor(this.GRAY).fontSize(7).font('Helvetica')
          .text('Weryfikacja e-druczek', COL + 90, doc.y);
        doc.image(qr2, COL + 90, doc.y + 10, { width: 70 });
      } catch (qrErr) {
        this.logger.warn(`QR generation failed: ${(qrErr as Error).message}`);
      }

      // ─── Footer ───────────────────────────────────────────
      doc.fontSize(7).fillColor(this.GRAY).font('Helvetica')
        .text(
          `Wygenerowano przez e-druczek.pl | Dokument ID: ${documentId}`,
          COL,
          doc.page.height - 30,
          { width: W, align: 'center' },
        );

      doc.end();
    });
  }

  private fmtNum(n: number): string {
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  }
}

interface InvoiceData {
  number: string;
  issueDate: string;
  currencyCode: string;
  sellerNip: string;
  sellerName: string;
  sellerAddress: string;
  buyerNip: string;
  buyerName: string;
  buyerAddress: string;
  items: InvoiceItem[];
  totalNet: number;
  totalVat: number;
  totalGross: number;
  ksefNumber: string;
}

interface InvoiceItem {
  lp: string;
  name: string;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  totalNet: number;
  vatRate: string;
  totalVat: number;
  totalGross: number;
}
