-- Migration 004: RLS policies + auth.users integration
-- KSeF SaaS MVP v5.1

-- -------------------------------------------------------
-- 1. Rebuild public.users as an extension of auth.users
-- -------------------------------------------------------

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id         UUID          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      VARCHAR       NOT NULL,
  role       app_user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 2. Auto-create public.users row for every new auth.users
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- -------------------------------------------------------
-- 3. Recreate FK from companies (was dropped by CASCADE)
-- -------------------------------------------------------

ALTER TABLE companies
  ADD CONSTRAINT companies_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- -------------------------------------------------------
-- 4. Enable RLS on all tables
-- -------------------------------------------------------

ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_ksef_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_jobs              ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- 5. Policies
-- -------------------------------------------------------
-- NOTE: Backend with service_role key bypasses RLS automatically.
-- These policies only apply to requests made with anon/authenticated key (frontend).

CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "companies_all_own" ON companies
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "ksef_conn_all_own" ON company_ksef_connections
  FOR ALL USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
  );

CREATE POLICY "documents_all_own" ON documents
  FOR ALL USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
  );

CREATE POLICY "document_items_all_own" ON document_items
  FOR ALL USING (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN companies c ON d.company_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "failed_jobs_select_own" ON failed_jobs
  FOR SELECT USING (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN companies c ON d.company_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );
