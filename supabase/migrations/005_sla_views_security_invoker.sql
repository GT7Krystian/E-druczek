-- Migration 005: SLA views — use security_invoker
-- Ensures SLA views inherit RLS from their underlying tables (documents)
-- instead of running with the definer's privileges.

ALTER VIEW sla_queued_stuck     SET (security_invoker = true);
ALTER VIEW sla_processing_stuck SET (security_invoker = true);
ALTER VIEW sla_offline_critical SET (security_invoker = true);
