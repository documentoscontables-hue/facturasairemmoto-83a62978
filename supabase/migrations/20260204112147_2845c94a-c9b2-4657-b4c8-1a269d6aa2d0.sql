-- Add client_name column to invoices table
ALTER TABLE public.invoices
ADD COLUMN client_name text;