-- Migration 003: failed_jobs (DLQ) + SLA monitoring helpers
-- KSeF SaaS MVP v5.1

-- -------------------------------------------------------
-- failed_jobs (Dead Letter Queue)
-- -------------------------------------------------------

CREATE TABLE failed_jobs (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID        REFERENCES documents(id) ON DELETE SET NULL,
  queue_name    VARCHAR     NOT NULL,
  job_id        VARCHAR     NOT NULL,
  step          VARCHAR     NOT NULL,
  error_message TEXT,
  error_stack   TEXT,
  payload       JSONB,
  retry_count   INTEGER     NOT NULL DEFAULT 0,
  resolved      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX idx_failed_jobs_document_id ON failed_jobs(document_id);
CREATE INDEX idx_failed_jobs_resolved    ON failed_jobs(resolved) WHERE resolved = FALSE;

-- -------------------------------------------------------
-- SLA monitoring view: QUEUED_STUCK (> 5 min)
-- -------------------------------------------------------

CREATE VIEW sla_queued_stuck AS
  SELECT id, company_id, ksef_status, updated_at,
         NOW() - updated_at AS stuck_duration
  FROM documents
  WHERE ksef_status = 'QUEUED'
    AND updated_at < NOW() - INTERVAL '5 minutes';

-- -------------------------------------------------------
-- SLA monitoring view: PROCESSING_STUCK (> 10 min)
-- -------------------------------------------------------

CREATE VIEW sla_processing_stuck AS
  SELECT id, company_id, ksef_status, updated_at,
         NOW() - updated_at AS stuck_duration
  FROM documents
  WHERE ksef_status = 'PROCESSING'
    AND updated_at < NOW() - INTERVAL '10 minutes';

-- -------------------------------------------------------
-- SLA monitoring view: OFFLINE_CRITICAL (deadline in < 2h)
-- -------------------------------------------------------

CREATE VIEW sla_offline_critical AS
  SELECT id, company_id, ksef_status, offline24_deadline,
         offline24_deadline - NOW() AS time_remaining
  FROM documents
  WHERE ksef_status = 'OFFLINE24_PENDING'
    AND offline24_deadline < NOW() + INTERVAL '2 hours'
    AND offline24_deadline > NOW();

-- -------------------------------------------------------
-- Helper: atomic 10k limit check (used in transaction)
-- SELECT check_monthly_b2b_limit(:company_id, :new_amount)
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION check_monthly_b2b_limit(
  p_company_id UUID,
  p_new_amount DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  current_total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(amount_gross), 0)
  INTO current_total
  FROM documents
  WHERE company_id = p_company_id
    AND invoice_target = 'B2B'
    AND direction = 'outgoing'
    AND issue_date >= DATE_TRUNC('month', CURRENT_DATE)
    AND ksef_status != 'REJECTED'
  FOR UPDATE;

  RETURN current_total + p_new_amount;
END;
$$ LANGUAGE plpgsql;
