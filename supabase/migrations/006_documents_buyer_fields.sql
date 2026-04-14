-- Migration 006: buyer and invoice metadata fields in documents table
-- Required for FA(3) XML generation (Podmiot2) and invoice display

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS invoice_number        VARCHAR,
  ADD COLUMN IF NOT EXISTS issue_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS buyer_nip             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS buyer_name            VARCHAR,
  ADD COLUMN IF NOT EXISTS buyer_address_line1   VARCHAR,
  ADD COLUMN IF NOT EXISTS buyer_address_line2   VARCHAR,
  ADD COLUMN IF NOT EXISTS buyer_country_code    VARCHAR(2) NOT NULL DEFAULT 'PL',
  ADD COLUMN IF NOT EXISTS original_issue_date   DATE,
  ADD COLUMN IF NOT EXISTS original_invoice_number VARCHAR;
