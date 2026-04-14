-- Migration 005: add address fields to companies
-- Required for FA(3) XML Podmiot1/Adres element

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS address_line1 VARCHAR,
  ADD COLUMN IF NOT EXISTS address_line2 VARCHAR;

-- Fix SLA views: rename to expose updated_at (already correct column name)
-- Views were already using updated_at — no change needed here.
