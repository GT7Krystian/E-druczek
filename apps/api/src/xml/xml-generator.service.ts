import { Injectable, BadRequestException } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { DocumentClass, VatRate } from '@e-druczek/shared';
import {
  XmlInvoiceInput,
  XmlInvoiceItemInput,
  XmlBuyerInput,
} from './xml-generator.types';

const FA3_NAMESPACE = 'http://crd.gov.pl/wzor/2025/04/03/04031/';
const FA3_KOD_FORMULARZA = 'FA';
const FA3_KOD_SYSTEMOWY = 'FA (3)';
const FA3_WERSJA_SCHEMY = '1-0E';
const FA3_WARIANT = 3;
const GENERATOR_VERSION = 'e-druczek-xml/0.1.0';

/** Format number as PLN amount with exactly 2 decimal places. */
function fmt2(n: number): string {
  return n.toFixed(2);
}

/** Format number for FaWiersz P_8B (quantity) — up to 4 decimal places. */
function fmt4(n: number): string {
  // strip trailing zeros after decimal but keep at least 2 places
  const s = n.toFixed(4);
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/**
 * Maps internal VatRate enum to FA(3) P_12 element value.
 * FA(3) expects strings like "23", "8", "5", "0", "zw", "np".
 */
function vatRateToP12(rate: VatRate): string {
  switch (rate) {
    case VatRate.RATE_23:
      return '23';
    case VatRate.RATE_8:
      return '8';
    case VatRate.RATE_5:
      return '5';
    case VatRate.RATE_0:
      return '0';
    case VatRate.ZW:
      return 'zw';
    case VatRate.NP:
      return 'np';
    default:
      throw new BadRequestException(`Unknown VAT rate: ${rate as string}`);
  }
}

@Injectable()
export class XmlGeneratorService {
  /**
   * Build a valid FA(3) XML string for the given invoice input.
   * Throws BadRequestException on logically invalid input.
   */
  generate(input: XmlInvoiceInput): string {
    this.validateInput(input);

    const currency = input.currencyCode ?? 'PLN';
    const isExempt = input.items.every(
      (i) => i.vatRate === VatRate.ZW || i.vatRate === VatRate.NP,
    );
    const isCorrection =
      input.documentClass === DocumentClass.FAKTURA_KORYGUJACA;

    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele(
      'Faktura',
      { xmlns: FA3_NAMESPACE },
    );

    // ─── Naglowek ─────────────────────────────────────────
    const naglowek = doc.ele('Naglowek');
    naglowek
      .ele('KodFormularza', {
        kodSystemowy: FA3_KOD_SYSTEMOWY,
        wersjaSchemy: FA3_WERSJA_SCHEMY,
      })
      .txt(FA3_KOD_FORMULARZA);
    naglowek.ele('WariantFormularza').txt(String(FA3_WARIANT));
    naglowek.ele('DataWytworzeniaFa').txt(new Date().toISOString());
    naglowek.ele('SystemInfo').txt(GENERATOR_VERSION);

    // ─── Podmiot1 (sprzedawca) ────────────────────────────
    const p1 = doc.ele('Podmiot1');
    const p1Dane = p1.ele('DaneIdentyfikacyjne');
    p1Dane.ele('NIP').txt(input.seller.nip);
    p1Dane.ele('Nazwa').txt(input.seller.name);
    const p1Adres = p1.ele('Adres');
    p1Adres.ele('KodKraju').txt(input.seller.address.countryCode);
    p1Adres.ele('AdresL1').txt(input.seller.address.addressLine1);
    if (input.seller.address.addressLine2) {
      p1Adres.ele('AdresL2').txt(input.seller.address.addressLine2);
    }

    // ─── Podmiot2 (nabywca) ───────────────────────────────
    this.appendBuyer(doc, input.buyer);

    // ─── Fa ───────────────────────────────────────────────
    const fa = doc.ele('Fa');
    fa.ele('KodWaluty').txt(currency);
    fa.ele('P_1').txt(input.issueDate);
    fa.ele('P_2').txt(input.invoiceNumber);

    // Aggregated tax sums
    if (!isExempt) {
      const net23 = input.totalNet23 ?? 0;
      const vat23 = input.totalVat23 ?? 0;
      // For corrections, deltas may be negative — emit if either side is non-zero.
      if (net23 !== 0 || vat23 !== 0) {
        fa.ele('P_13_1').txt(fmt2(net23));
        fa.ele('P_14_1').txt(fmt2(vat23));
      }
    } else {
      // For exempt invoices, use P_13_7 (sum of exempt sales)
      const exemptTotal = input.totalExempt ?? input.totalGross;
      fa.ele('P_13_7').txt(fmt2(exemptTotal));
    }
    fa.ele('P_15').txt(fmt2(input.totalGross));

    // ─── Adnotacje ────────────────────────────────────────
    const adnotacje = fa.ele('Adnotacje');
    adnotacje.ele('P_16').txt('2');
    adnotacje.ele('P_17').txt('2');
    adnotacje.ele('P_18').txt('2');
    adnotacje.ele('P_18A').txt('2');
    const zwolnienie = adnotacje.ele('Zwolnienie');
    if (isExempt) {
      zwolnienie.ele('P_19').txt('1');
      const exemptItem = input.items.find(
        (i) => i.vatExemptionText && i.vatExemptionText.length > 0,
      );
      const exemptText =
        exemptItem?.vatExemptionText ?? 'art. 113 ust. 1 ustawy o VAT';
      // Default to P_19A (Polish law). If caller specified P_19B/C use that.
      const node = exemptItem?.vatExemptionNode ?? 'P_19A';
      zwolnienie.ele(node).txt(exemptText);
    } else {
      zwolnienie.ele('P_19N').txt('1');
    }
    adnotacje.ele('NoweSrodkiTransportu').ele('P_22').txt('2');
    adnotacje.ele('P_23').txt('2');
    const procedura = adnotacje.ele('PMarzy');
    procedura.ele('P_PMarzyN').txt('1');

    // ─── DaneFaKorygowanej (only for corrections) ─────────
    if (isCorrection) {
      const ref = input.originalInvoice!;
      const dane = fa.ele('DaneFaKorygowanej');
      dane.ele('DataWystFaKorygowanej').txt(ref.issueDate);
      dane.ele('NrFaKorygowanej').txt(ref.invoiceNumber);
      if (ref.ksefReferenceNumber) {
        dane.ele('NrKSeF').ele('NrKSeFFaKorygowanej').txt(ref.ksefReferenceNumber);
      } else {
        dane.ele('NrKSeFN').txt('1'); // 1 = original NOT in KSeF
      }
      // PrzyczynaKorekty is required by the schema
      fa.ele('PrzyczynaKorekty').txt('Korekta wartości faktury');
    }

    // ─── FaWiersz (lines) ─────────────────────────────────
    input.items.forEach((item, idx) => {
      this.appendLineItem(fa, item, idx + 1);
    });

    // ─── Stopka with platnosc placeholder is optional ─────

    return doc.end({ prettyPrint: true });
  }

  // ────────────────────────────────────────────────────────

  private appendBuyer(doc: ReturnType<typeof create>, buyer: XmlBuyerInput) {
    const p2 = (doc as any).ele('Podmiot2');
    const p2Dane = p2.ele('DaneIdentyfikacyjne');
    if (buyer.nip) {
      p2Dane.ele('NIP').txt(buyer.nip);
    } else {
      // B2C — schema allows BrakID as a marker
      p2Dane.ele('BrakID').txt('1');
    }
    p2Dane.ele('Nazwa').txt(buyer.name);
    if (buyer.address) {
      const p2Adres = p2.ele('Adres');
      p2Adres.ele('KodKraju').txt(buyer.address.countryCode);
      p2Adres.ele('AdresL1').txt(buyer.address.addressLine1);
      if (buyer.address.addressLine2) {
        p2Adres.ele('AdresL2').txt(buyer.address.addressLine2);
      }
    }
    p2.ele('JST').txt('2');
    p2.ele('GV').txt('2');
  }

  private appendLineItem(
    fa: ReturnType<typeof create>,
    item: XmlInvoiceItemInput,
    rowNumber: number,
  ) {
    const w = (fa as any).ele('FaWiersz');
    w.ele('NrWierszaFa').txt(String(rowNumber));
    w.ele('P_7').txt(item.name);
    w.ele('P_8A').txt(item.unit);
    w.ele('P_8B').txt(fmt4(item.quantity));
    w.ele('P_9A').txt(fmt2(item.unitPriceNet));
    w.ele('P_11').txt(fmt2(item.totalNet));
    w.ele('P_12').txt(vatRateToP12(item.vatRate));
  }

  private validateInput(input: XmlInvoiceInput): void {
    if (!input.seller?.nip || !/^\d{10}$/.test(input.seller.nip)) {
      throw new BadRequestException('Invalid seller NIP (must be 10 digits)');
    }
    if (!input.invoiceNumber) {
      throw new BadRequestException('invoiceNumber is required');
    }
    if (!input.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) {
      throw new BadRequestException('issueDate must be YYYY-MM-DD');
    }
    if (!input.items?.length) {
      throw new BadRequestException('At least one line item is required');
    }
    if (
      input.documentClass === DocumentClass.FAKTURA_KORYGUJACA &&
      !input.originalInvoice
    ) {
      throw new BadRequestException(
        'originalInvoice is required for FAKTURA_KORYGUJACA',
      );
    }
  }
}
