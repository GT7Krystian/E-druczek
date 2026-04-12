import { XmlGeneratorService } from './xml-generator.service';
import {
  DocumentClass,
  VatRate,
  VatExemptionNode,
} from '@e-druczek/shared';
import { XmlInvoiceInput } from './xml-generator.types';

const seller = {
  nip: '5260250274',
  name: 'Testowa JDG',
  address: {
    countryCode: 'PL',
    addressLine1: 'ul. Testowa 1/2',
    addressLine2: '00-001 Warszawa',
  },
};

const b2bBuyer = {
  nip: '1234567890',
  name: 'Kontrahent Sp. z o.o.',
  address: {
    countryCode: 'PL',
    addressLine1: 'ul. Klienta 5',
    addressLine2: '02-345 Warszawa',
  },
};

describe('XmlGeneratorService', () => {
  let svc: XmlGeneratorService;
  beforeEach(() => {
    svc = new XmlGeneratorService();
  });

  describe('Scenario 1 — VAT 23% B2B invoice', () => {
    const input: XmlInvoiceInput = {
      documentClass: DocumentClass.FAKTURA_PIERWOTNA,
      invoiceNumber: 'FV/2026/0001',
      issueDate: '2026-04-11',
      seller,
      buyer: b2bBuyer,
      items: [
        {
          name: 'Usługa testowa',
          quantity: 1,
          unit: 'szt',
          unitPriceNet: 100,
          vatRate: VatRate.RATE_23,
          totalNet: 100,
          totalVat: 23,
          totalGross: 123,
        },
      ],
      totalNet23: 100,
      totalVat23: 23,
      totalGross: 123,
    };

    let xml: string;
    beforeEach(() => {
      xml = svc.generate(input);
    });

    it('emits XML declaration and Faktura root with FA(3) namespace', () => {
      expect(xml).toMatch(/<\?xml version="1\.0" encoding="UTF-8"\?>/);
      expect(xml).toContain(
        '<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">',
      );
    });

    it('emits Naglowek with FA(3) variant and form code', () => {
      expect(xml).toMatch(
        /<KodFormularza kodSystemowy="FA \(3\)" wersjaSchemy="1-0E">FA<\/KodFormularza>/,
      );
      expect(xml).toContain('<WariantFormularza>3</WariantFormularza>');
    });

    it('contains seller NIP, name and address', () => {
      expect(xml).toContain('<NIP>5260250274</NIP>');
      expect(xml).toContain('<Nazwa>Testowa JDG</Nazwa>');
      expect(xml).toContain('<KodKraju>PL</KodKraju>');
      expect(xml).toContain('<AdresL1>ul. Testowa 1/2</AdresL1>');
    });

    it('contains buyer NIP and JST/GV markers', () => {
      expect(xml).toContain('<NIP>1234567890</NIP>');
      expect(xml).toContain('<JST>2</JST>');
      expect(xml).toContain('<GV>2</GV>');
    });

    it('emits invoice number, issue date and currency', () => {
      expect(xml).toContain('<KodWaluty>PLN</KodWaluty>');
      expect(xml).toContain('<P_1>2026-04-11</P_1>');
      expect(xml).toContain('<P_2>FV/2026/0001</P_2>');
    });

    it('emits VAT 23% sums and total gross', () => {
      expect(xml).toContain('<P_13_1>100.00</P_13_1>');
      expect(xml).toContain('<P_14_1>23.00</P_14_1>');
      expect(xml).toContain('<P_15>123.00</P_15>');
    });

    it('emits Adnotacje with P_19N=1 (no exemption) and P_22N=1', () => {
      expect(xml).toContain('<P_19N>1</P_19N>');
      expect(xml).not.toContain('<P_19A>');
      expect(xml).toContain('<P_22N>1</P_22N>');
      expect(xml).toContain('<RodzajFaktury>VAT</RodzajFaktury>');
    });

    it('emits FaWiersz with line item details and P_12=23', () => {
      expect(xml).toContain('<NrWierszaFa>1</NrWierszaFa>');
      expect(xml).toContain('<P_7>Usługa testowa</P_7>');
      expect(xml).toContain('<P_8A>szt</P_8A>');
      expect(xml).toContain('<P_12>23</P_12>');
    });
  });

  describe('Scenario 2 — Faktura ZW (VAT exempt)', () => {
    const input: XmlInvoiceInput = {
      documentClass: DocumentClass.FAKTURA_PIERWOTNA,
      invoiceNumber: 'FV/2026/ZW/0001',
      issueDate: '2026-04-11',
      seller,
      buyer: b2bBuyer,
      items: [
        {
          name: 'Korepetycje',
          quantity: 2,
          unit: 'godz',
          unitPriceNet: 80,
          vatRate: VatRate.ZW,
          totalNet: 160,
          totalVat: 0,
          totalGross: 160,
          vatExemptionNode: VatExemptionNode.P_19A,
          vatExemptionText: 'art. 113 ust. 1 ustawy o VAT',
        },
      ],
      totalExempt: 160,
      totalGross: 160,
    };

    let xml: string;
    beforeEach(() => {
      xml = svc.generate(input);
    });

    it('uses P_13_7 (sum of exempt sales) instead of P_13_1', () => {
      expect(xml).toContain('<P_13_7>160.00</P_13_7>');
      expect(xml).not.toContain('<P_13_1>');
      expect(xml).not.toContain('<P_14_1>');
    });

    it('emits P_19=1 with P_19A legal basis text', () => {
      expect(xml).toContain('<P_19>1</P_19>');
      expect(xml).toContain('<P_19A>art. 113 ust. 1 ustawy o VAT</P_19A>');
      expect(xml).not.toContain('<P_19N>');
    });

    it('emits FaWiersz with P_12=zw', () => {
      expect(xml).toContain('<P_12>zw</P_12>');
    });
  });

  describe('Scenario 3 — Faktura korygująca (delta)', () => {
    const input: XmlInvoiceInput = {
      documentClass: DocumentClass.FAKTURA_KORYGUJACA,
      invoiceNumber: 'FV/2026/KOR/0001',
      issueDate: '2026-04-12',
      seller,
      buyer: b2bBuyer,
      originalInvoice: {
        issueDate: '2026-04-10',
        invoiceNumber: 'FV/2026/0001',
        ksefReferenceNumber:
          '5260250274-20260410-000001-AABBCC-DDEEFF-01',
      },
      items: [
        {
          name: 'Korekta wartości',
          quantity: 1,
          unit: 'szt',
          unitPriceNet: -10,
          vatRate: VatRate.RATE_23,
          totalNet: -10,
          totalVat: -2.3,
          totalGross: -12.3,
        },
      ],
      totalNet23: -10,
      totalVat23: -2.3,
      totalGross: -12.3,
    };

    let xml: string;
    beforeEach(() => {
      xml = svc.generate(input);
    });

    it('emits DaneFaKorygowanej with original invoice number', () => {
      expect(xml).toContain('<DaneFaKorygowanej>');
      expect(xml).toContain('<DataWystFaKorygowanej>2026-04-10</DataWystFaKorygowanej>');
      expect(xml).toContain('<NrFaKorygowanej>FV/2026/0001</NrFaKorygowanej>');
    });

    it('emits NrKSeFFaKorygowanej when original was in KSeF', () => {
      expect(xml).toContain(
        '<NrKSeFFaKorygowanej>5260250274-20260410-000001-AABBCC-DDEEFF-01</NrKSeFFaKorygowanej>',
      );
      expect(xml).not.toContain('<NrKSeFN>');
    });

    it('emits PrzyczynaKorekty', () => {
      expect(xml).toContain('<PrzyczynaKorekty>');
    });

    it('emits negative delta amounts in P_13_1, P_14_1, P_15', () => {
      expect(xml).toContain('<P_13_1>-10.00</P_13_1>');
      expect(xml).toContain('<P_14_1>-2.30</P_14_1>');
      expect(xml).toContain('<P_15>-12.30</P_15>');
    });
  });

  describe('Input validation', () => {
    it('rejects invalid NIP', () => {
      expect(() =>
        svc.generate({
          documentClass: DocumentClass.FAKTURA_PIERWOTNA,
          invoiceNumber: 'FV/1',
          issueDate: '2026-04-11',
          seller: { ...seller, nip: '123' },
          buyer: b2bBuyer,
          items: [
            {
              name: 'x',
              quantity: 1,
              unit: 'szt',
              unitPriceNet: 1,
              vatRate: VatRate.RATE_23,
              totalNet: 1,
              totalVat: 0.23,
              totalGross: 1.23,
            },
          ],
          totalGross: 1.23,
        }),
      ).toThrow(/Invalid seller NIP/);
    });

    it('rejects FAKTURA_KORYGUJACA without originalInvoice', () => {
      expect(() =>
        svc.generate({
          documentClass: DocumentClass.FAKTURA_KORYGUJACA,
          invoiceNumber: 'FV/1',
          issueDate: '2026-04-11',
          seller,
          buyer: b2bBuyer,
          items: [
            {
              name: 'x',
              quantity: 1,
              unit: 'szt',
              unitPriceNet: 1,
              vatRate: VatRate.RATE_23,
              totalNet: 1,
              totalVat: 0.23,
              totalGross: 1.23,
            },
          ],
          totalGross: 1.23,
        }),
      ).toThrow(/originalInvoice is required/);
    });
  });
});
