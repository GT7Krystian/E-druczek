/**
 * Typed input for XmlGeneratorService.
 *
 * Reflects the minimum set of fields required to build a valid FA(3) XML
 * for the three MVP scenarios: VAT invoice, exempt (ZW) invoice, correction.
 */

import { VatRate, VatExemptionNode, DocumentClass } from '@e-druczek/shared';

export interface XmlSellerInput {
  nip: string; // 10-digit
  name: string;
  address: {
    countryCode: string; // ISO 3166-1 alpha-2, e.g. "PL"
    addressLine1: string; // street, building, flat
    addressLine2?: string; // postal code + city
  };
}

export interface XmlBuyerInput {
  nip?: string; // present for B2B
  name: string;
  address?: {
    countryCode: string;
    addressLine1: string;
    addressLine2?: string;
  };
}

export interface XmlInvoiceItemInput {
  name: string;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  vatRate: VatRate;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  vatExemptionNode?: VatExemptionNode | null;
  vatExemptionText?: string | null;
}

export interface XmlOriginalInvoiceRef {
  /** Issue date of the corrected invoice (YYYY-MM-DD). */
  issueDate: string;
  /** Local invoice number of the corrected invoice. */
  invoiceNumber: string;
  /** KSeF reference number, if the corrected invoice was already in KSeF. */
  ksefReferenceNumber?: string | null;
}

export interface XmlInvoiceInput {
  documentClass: DocumentClass;
  /** Local invoice number, e.g. "FV/2026/0001" */
  invoiceNumber: string;
  /** Issue date in YYYY-MM-DD format. */
  issueDate: string;
  /** ISO 4217 currency code. Default "PLN". */
  currencyCode?: string;

  seller: XmlSellerInput;
  buyer: XmlBuyerInput;

  items: XmlInvoiceItemInput[];

  /** Sum of net amounts for VAT 23% rate. */
  totalNet23?: number;
  totalVat23?: number;
  /** Sum of net for exempt items (ZW). */
  totalExempt?: number;
  /** Total gross. */
  totalGross: number;

  /** Required for FAKTURA_KORYGUJACA. */
  originalInvoice?: XmlOriginalInvoiceRef;
}
