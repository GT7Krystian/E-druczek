-- Migration 001: users, companies, company_ksef_connections
-- KSeF SaaS MVP v5.1

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------
-- ENUM TYPES
-- -------------------------------------------------------

CREATE TYPE user_role AS ENUM ('admin', 'user');

CREATE TYPE vat_status AS ENUM (
  'VAT_ACTIVE',
  'VAT_EXEMPT_SUBJECTIVE',
  'VAT_EXEMPT_OBJECTIVE'
);

CREATE TYPE cert_type2_status AS ENUM ('VALID', 'REVOKED', 'UNKNOWN');

-- -------------------------------------------------------
-- users
-- -------------------------------------------------------

CREATE TABLE users (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email      VARCHAR     NOT NULL UNIQUE,
  role       user_role   NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- companies
-- -------------------------------------------------------

CREATE TABLE companies (
  id                  UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nip                 VARCHAR(10) NOT NULL,
  name                VARCHAR    NOT NULL,
  vat_status          vat_status NOT NULL,
  monthly_b2b_total   DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_nip_per_user UNIQUE (user_id, nip)
);

CREATE INDEX idx_companies_user_id ON companies(user_id);

-- -------------------------------------------------------
-- company_ksef_connections
-- -------------------------------------------------------

CREATE TABLE company_ksef_connections (
  id                          UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                  UUID              NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ksef_token_encrypted        TEXT,
  ksef_cert_type1_encrypted   TEXT,
  ksef_cert_type2_encrypted   TEXT,
  cert_type2_expires_at       TIMESTAMPTZ,
  cert_type2_status_cache     cert_type2_status NOT NULL DEFAULT 'UNKNOWN',
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_connection_per_company UNIQUE (company_id)
);
