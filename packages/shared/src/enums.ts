export enum VatStatus {
  VAT_ACTIVE = 'VAT_ACTIVE',
  VAT_EXEMPT_SUBJECTIVE = 'VAT_EXEMPT_SUBJECTIVE',
  VAT_EXEMPT_OBJECTIVE = 'VAT_EXEMPT_OBJECTIVE',
}

export enum KsefStatus {
  LOCAL_ONLY = 'LOCAL_ONLY',
  DRAFT = 'DRAFT',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  PROCESSING_TIMEOUT = 'PROCESSING_TIMEOUT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  OFFLINE24_PENDING = 'OFFLINE24_PENDING',
  SEND_FAILED = 'SEND_FAILED',
}

export enum PdfStatus {
  PENDING = 'PENDING',
  GENERATED = 'GENERATED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

export enum DocumentClass {
  FAKTURA_PIERWOTNA = 'FAKTURA_PIERWOTNA',
  FAKTURA_KORYGUJACA = 'FAKTURA_KORYGUJACA',
}

export enum InvoiceTarget {
  B2B = 'B2B',
  B2C = 'B2C',
}

export enum Direction {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

export enum VatRate {
  RATE_23 = '23',
  RATE_8 = '8',
  RATE_5 = '5',
  RATE_0 = '0',
  ZW = 'zw',
  NP = 'np',
}

export enum VatExemptionNode {
  P_19A = 'P_19A',
  P_19B = 'P_19B',
  P_19C = 'P_19C',
}

export enum CertType2StatusCache {
  VALID = 'VALID',
  REVOKED = 'REVOKED',
  UNKNOWN = 'UNKNOWN',
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
