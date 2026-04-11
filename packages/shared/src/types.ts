import {
  VatStatus,
  KsefStatus,
  PdfStatus,
  DocumentClass,
  InvoiceTarget,
  Direction,
  VatRate,
  VatExemptionNode,
  CertType2StatusCache,
  UserRole,
} from './enums';

export interface User {
  id: string;
  email: string;
  created_at: string;
  role: UserRole;
}

export interface Company {
  id: string;
  user_id: string;
  nip: string;
  name: string;
  vat_status: VatStatus;
  monthly_b2b_total: number;
}

export interface CompanyKsefConnection {
  id: string;
  company_id: string;
  ksef_token_encrypted: string | null;
  ksef_cert_type1_encrypted: string | null;
  ksef_cert_type2_encrypted: string | null;
  cert_type2_expires_at: string | null;
  cert_type2_status_cache: CertType2StatusCache;
}

export interface Document {
  id: string;
  company_id: string;
  direction: Direction;
  invoice_target: InvoiceTarget;
  document_class: DocumentClass;
  original_ksef_reference_number: string | null;
  original_was_in_ksef: boolean | null;
  amount_gross: number;
  ksef_status: KsefStatus;
  ksef_reference_number: string | null;
  upo_number: string | null;
  xml_hash: string | null;
  xml_schema_version: string | null;
  xml_generator_version: string | null;
  idempotency_key: string | null;
  offline24_deadline: string | null;
  offline24_attempt_log: OfflineAttempt[] | null;
  pdf_status: PdfStatus;
  pdf_generated_from_xml: boolean;
  qr_version: string | null;
  retry_count: number;
  xml_url: string | null;
  pdf_url: string | null;
}

export interface OfflineAttempt {
  timestamp: string;
  error_code: string | null;
  timed_out: boolean;
}

export interface DocumentItem {
  id: string;
  document_id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price_net: number;
  vat_rate: VatRate;
  total_net: number;
  total_vat: number;
  total_gross: number;
  vat_exemption_node: VatExemptionNode | null;
  vat_exemption_text: string | null;
  is_delta_correction: boolean;
}
