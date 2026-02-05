-- Drop existing function first
DROP FUNCTION IF EXISTS public.get_user_invoices_admin(uuid);

-- Add assigned_account column to invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS assigned_account text DEFAULT NULL;

-- Create account_books table to store parsed accounts from user's book
CREATE TABLE IF NOT EXISTS public.account_books (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create accounts table to store individual accounts from the book
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES public.account_books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  account_code text NOT NULL,
  account_description text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_book_id ON public.accounts(book_id);
CREATE INDEX IF NOT EXISTS idx_account_books_user_id ON public.account_books(user_id);

-- Enable RLS on account_books
ALTER TABLE public.account_books ENABLE ROW LEVEL SECURITY;

-- RLS policies for account_books
CREATE POLICY "Users can view their own account books" 
ON public.account_books 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own account books" 
ON public.account_books 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own account books" 
ON public.account_books 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own account books" 
ON public.account_books 
FOR DELETE 
USING (auth.uid() = user_id);

-- Enable RLS on accounts
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for accounts
CREATE POLICY "Users can view their own accounts" 
ON public.accounts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own accounts" 
ON public.accounts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own accounts" 
ON public.accounts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger to update account_books.updated_at
CREATE TRIGGER update_account_books_updated_at
BEFORE UPDATE ON public.account_books
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Recreate get_user_invoices_admin to include assigned_account
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
  assigned_account text,
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
    i.assigned_account,
    i.created_at,
    i.updated_at
  FROM public.invoices i
  WHERE i.user_id = target_user_id
    AND public.has_role(auth.uid(), 'admin')
  ORDER BY i.created_at DESC;
$$;