-- Function for admins to get invoices of a specific user
CREATE OR REPLACE FUNCTION public.get_user_invoices_admin(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  file_name text,
  file_path text,
  file_type text,
  client_name text,
  invoice_type text,
  operation_type text,
  classification_status text,
  classification_details jsonb,
  feedback_status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    i.id,
    i.user_id,
    i.file_name,
    i.file_path,
    i.file_type,
    i.client_name,
    i.invoice_type,
    i.operation_type,
    i.classification_status,
    i.classification_details,
    i.feedback_status,
    i.created_at,
    i.updated_at
  FROM public.invoices i
  WHERE i.user_id = target_user_id
    AND public.has_role(auth.uid(), 'admin')
  ORDER BY i.created_at DESC;
$$;