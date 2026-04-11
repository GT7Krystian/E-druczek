-- Migration 002: documents, document_items
-- KSeF SaaS MVP v5.1

-- -------------------------------------------------------
-- ENUM TYPES
-- -------------------------------------------------------

CREATE TYPE direction AS ENUM ('incoming', 'outgoing');

CREATE TYPE invoice_target AS ENUM ('B2B', 'B2C');

CREATE TYPE document_class AS ENUM (
  'FAKTURA_PIERWOTNA',
  'FAKTURA_KORYGUJACA'
);

CREATE TYPE ksef_status AS ENUM (
  'LOCAL_ONLY',
  'DRAFT',
  'QUEUED',
  'PROCESSING',
  'PROCESSING_TIMEOUT',
  'ACCEPTED',
  'REJECTED',
  'OFFLINE24_PENDING',
  'SEND_FAILED'
);

CREATE TYPE pdf_status AS ENUM (
  'PENDING',
  'GENERATED',
  'FAILED',
  'RETRYING'
);

CREATE TYPE vat_rate AS ENUM ('23', '8', '5', '0', 'zw', 'np');

CREATE TYPE vat_exemption_node AS ENUM ('P_19A', 'P_19B', 'P_19C');

-- -------------------------------------------------------
-- documents
-- -------------------------------------------------------

CREATE TABLE documents (
  id                              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                      UUID           NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  direction                       direction      NOT NULL,
  invoice_target                  invoice_target NOT NULL,
  document_class                  document_class NOT NULL DEFAULT 'FAKTURA_PIERWOTNA',
  original_ksef_reference_number  VARCHAR,
  original_was_in_ksef            BOOLEAN,
  amount_gross                    DECIMAL(12,2)  NOT NULL,
  issue_date                      DATE           NOT NULL DEFAULT CURRENT_DATE,
  ksef_status                     ksef_status    NOT NULL DEFAULT 'DRAFT',
  ksef_reference_number           VARCHAR,
  upo_number                      VARCHAR,
  xml_hash                        VARCHAR(64),
  xml_schema_version              VARCHAR,
  xml_generator_version           VARCHAR,
  idempotency_key                 VARCHAR(64) UNIQUE,
  offline24_deadline              TIMESTAMPTZ,
  offline24_attempt_log           JSONB,
  pdf_status                      pdf_status     NOT NULL DEFAULT 'PENDING',
  pdf_generated_from_xml          BOOLEAN        NOT NULL DEFAULT FALSE,
  qr_version                      VARCHAR,
  retry_count                     INTEGER        NOT NULL DEFAULT 0,
  xml_url                         VARCHAR,
  pdf_url                         VARCHAR,
  created_at                      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_company_id       ON documents(company_id);
CREATE INDEX idx_documents_ksef_status      ON documents(ksef_status);
CREATE INDEX idx_documents_issue_date       ON documents(issue_date);
CREATE INDEX idx_documents_invoice_target   ON documents(invoice_target);

-- Data Freeze: block mutations once status >= QUEUED
CREATE OR REPLACE FUNCTION prevent_document_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.ksef_status IN ('QUEUED', 'PROCESSING', 'PROCESSING_TIMEOUT', 'ACCEPTED', 'REJECTED', 'OFFLINE24_PENDING')
     AND (NEW.amount_gross <> OLD.amount_gross
          OR NEW.direction <> OLD.direction
          OR NEW.invoice_target <> OLD.invoice_target)
  THEN
    RAISE EXCEPTION 'Document is frozen (ksef_status=%) and cannot be mutated', OLD.ksef_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_document_data_freeze
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION prevent_document_mutation();

-- -------------------------------------------------------
-- document_items
-- -------------------------------------------------------

CREATE TABLE document_items (
  id                  UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id         UUID                 NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  name                VARCHAR(512)         NOT NULL,
  quantity            DECIMAL(10,4)        NOT NULL,
  unit                VARCHAR              NOT NULL,
  unit_price_net      DECIMAL(12,4)        NOT NULL,
  vat_rate            vat_rate             NOT NULL,
  total_net           DECIMAL(12,2)        NOT NULL,
  total_vat           DECIMAL(12,2)        NOT NULL,
  total_gross         DECIMAL(12,2)        NOT NULL,
  vat_exemption_node  vat_exemption_node,
  vat_exemption_text  TEXT,
  is_delta_correction BOOLEAN              NOT NULL DEFAULT FALSE,
  sort_order          INTEGER              NOT NULL DEFAULT 0
);

CREATE INDEX idx_document_items_document_id ON document_items(document_id);
