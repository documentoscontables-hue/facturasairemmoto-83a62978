
-- Helper function to check admin or superadmin
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'superadmin')
  )
$$;

-- Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage teams" ON public.teams FOR ALL TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));
CREATE POLICY "Authenticated can view teams" ON public.teams FOR SELECT TO authenticated
  USING (true);

-- Add team_id to profiles
ALTER TABLE public.profiles ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- Coordinator-team assignments
CREATE TABLE public.coordinator_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, team_id)
);
ALTER TABLE public.coordinator_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coordinator teams" ON public.coordinator_teams FOR ALL TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));
CREATE POLICY "Coordinators can view their assignments" ON public.coordinator_teams FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Invoices: admin and coordinator access
CREATE POLICY "Admins can view all invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Coordinators can view team invoices" ON public.invoices FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordinador') AND
    EXISTS (
      SELECT 1 FROM public.coordinator_teams ct
      JOIN public.profiles p ON p.team_id = ct.team_id
      WHERE ct.user_id = auth.uid() AND p.user_id = invoices.user_id
    )
  );

-- Profiles: coordinator and admin access
CREATE POLICY "Coordinators can view team profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordinador') AND
    EXISTS (
      SELECT 1 FROM public.coordinator_teams ct
      WHERE ct.user_id = auth.uid() AND ct.team_id = profiles.team_id
    )
  );

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

-- User roles: update to include superadmin
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

-- Update get_user_stats for new role system
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, total_invoices bigint, classified_invoices bigint, pending_invoices bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.email,
    p.created_at,
    COUNT(i.id) AS total_invoices,
    COUNT(CASE WHEN i.classification_status = 'classified' THEN 1 END) AS classified_invoices,
    COUNT(CASE WHEN i.classification_status = 'pending' THEN 1 END) AS pending_invoices
  FROM public.profiles p
  LEFT JOIN public.invoices i ON p.user_id = i.user_id
  WHERE public.is_admin_or_superadmin(auth.uid())
  GROUP BY p.user_id, p.email, p.created_at
  ORDER BY p.created_at DESC
$$;

-- Update get_user_invoices_admin for coordinators
CREATE OR REPLACE FUNCTION public.get_user_invoices_admin(target_user_id uuid)
RETURNS TABLE(id uuid, user_id uuid, file_name text, file_path text, file_type text, client_name text, invoice_type text, operation_type text, classification_status text, classification_details jsonb, feedback_status text, assigned_account text, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    i.id, i.user_id, i.file_name, i.file_path, i.file_type, i.client_name,
    i.invoice_type, i.operation_type, i.classification_status, i.classification_details,
    i.feedback_status, i.assigned_account, i.created_at, i.updated_at
  FROM public.invoices i
  WHERE i.user_id = target_user_id
    AND (
      public.is_admin_or_superadmin(auth.uid())
      OR (
        public.has_role(auth.uid(), 'coordinador')
        AND EXISTS (
          SELECT 1 FROM public.coordinator_teams ct
          JOIN public.profiles p ON p.team_id = ct.team_id
          WHERE ct.user_id = auth.uid() AND p.user_id = target_user_id
        )
      )
    )
  ORDER BY i.created_at DESC
$$;
