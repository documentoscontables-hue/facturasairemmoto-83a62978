-- ================================================
-- Schema for: facturasairemmoto (VPS PostgreSQL)
-- Replaces Supabase Auth + DB
-- ================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom enum for roles
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('superadmin', 'admin', 'coordinador', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ================================================
-- Users table (replaces auth.users)
-- ================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_confirmed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- Profiles
-- ================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  team_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- Teams
-- ================================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK from profiles to teams
ALTER TABLE profiles
  ADD CONSTRAINT profiles_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- ================================================
-- User roles
-- ================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- ================================================
-- Coordinator ↔ Team assignments
-- ================================================
CREATE TABLE IF NOT EXISTS coordinator_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, team_id)
);

-- ================================================
-- Invoices
-- ================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf' | 'image'
  client_name TEXT,
  invoice_type TEXT,       -- 'emitida' | 'recibida' | 'proforma' | 'albaran' | 'ticket' | 'no_es_factura'
  operation_type TEXT,
  classification_status TEXT NOT NULL DEFAULT 'pending',
  classification_details JSONB,
  feedback_status TEXT,    -- 'correct' | 'corrected' | null
  assigned_account TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- Classification feedback
-- ================================================
CREATE TABLE IF NOT EXISTS classification_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL,
  original_invoice_type TEXT,
  original_operation_type TEXT,
  corrected_invoice_type TEXT,
  corrected_operation_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- Account books
-- ================================================
CREATE TABLE IF NOT EXISTS account_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- Accounts (parsed from account books)
-- ================================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES account_books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- Indexes
-- ================================================
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_classification_status ON invoices(classification_status);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_book_id ON accounts(book_id);
CREATE INDEX IF NOT EXISTS idx_coordinator_teams_user_id ON coordinator_teams(user_id);

-- ================================================
-- Auto-update updated_at trigger
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_account_books_updated_at BEFORE UPDATE ON account_books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- Seed: SuperAdmin user (ai01@remmoto.co)
-- Password: you'll set it via the API or update here
-- Default password hash for 'Admin123!' using bcrypt
-- You should change this after first login
-- ================================================
-- INSERT INTO users (email, password_hash) VALUES ('ai01@remmoto.co', '$2a$10$placeholder');
-- Then insert profile and role after.
