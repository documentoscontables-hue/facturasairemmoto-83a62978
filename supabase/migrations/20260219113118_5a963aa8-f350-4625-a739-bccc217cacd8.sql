
-- Fix invoices_operation_type_check to include all valid values used by the system
ALTER TABLE public.invoices DROP CONSTRAINT invoices_operation_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_operation_type_check 
  CHECK (operation_type = ANY (ARRAY[
    'interiores_iva_deducible',
    'facturas_compensaciones_agrarias',
    'adquisiciones_intracomunitarias_bienes',
    'inversion_sujeto_pasivo',
    'iva_no_deducible',
    'adquisiciones_intracomunitarias_servicios',
    'importaciones',
    'suplidos',
    'kit_digital',
    'no_aplica',
    'otro',
    'ticket',
    'no_registrado_vies',
    'amazon'
  ]));

-- Fix invoices_invoice_type_check to include 'duplicada'
ALTER TABLE public.invoices DROP CONSTRAINT invoices_invoice_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_type_check 
  CHECK (invoice_type = ANY (ARRAY[
    'emitida',
    'recibida',
    'albaran',
    'proforma',
    'ticket',
    'no_es_factura',
    'duplicada'
  ]));
