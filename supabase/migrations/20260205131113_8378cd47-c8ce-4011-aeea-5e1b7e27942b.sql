-- Create storage bucket for account books
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'account-books', 
  'account-books', 
  false,
  52428800,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for account-books bucket
CREATE POLICY "Users can upload their own account books"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'account-books' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own account books"
ON storage.objects FOR SELECT
USING (bucket_id = 'account-books' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own account books"
ON storage.objects FOR DELETE
USING (bucket_id = 'account-books' AND auth.uid()::text = (storage.foldername(name))[1]);