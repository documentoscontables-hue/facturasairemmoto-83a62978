-- Create table to store classification feedback for learning
CREATE TABLE public.classification_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  original_invoice_type TEXT,
  original_operation_type TEXT,
  corrected_invoice_type TEXT,
  corrected_operation_type TEXT,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.classification_feedback ENABLE ROW LEVEL SECURITY;

-- Users can view their own feedback
CREATE POLICY "Users can view their own feedback"
ON public.classification_feedback
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create feedback for their invoices
CREATE POLICY "Users can create feedback for their invoices"
ON public.classification_feedback
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own feedback
CREATE POLICY "Users can update their own feedback"
ON public.classification_feedback
FOR UPDATE
USING (auth.uid() = user_id);

-- Add feedback_status to invoices table to track if feedback was given
ALTER TABLE public.invoices 
ADD COLUMN feedback_status TEXT DEFAULT NULL;

-- Create index for faster queries
CREATE INDEX idx_classification_feedback_invoice ON public.classification_feedback(invoice_id);
CREATE INDEX idx_classification_feedback_user ON public.classification_feedback(user_id);