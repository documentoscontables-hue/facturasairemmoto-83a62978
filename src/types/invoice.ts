export type InvoiceType = 'emitida' | 'recibida' | 'proforma';

export type ClassificationStatus = 'pending' | 'classified' | 'error';

export type OperationType = 
  | 'interiores_iva_deducible'
  | 'facturas_compensaciones_agrarias'
  | 'adquisiciones_intracomunitarias_bienes'
  | 'inversion_sujeto_pasivo'
  | 'iva_no_deducible'
  | 'adquisiciones_intracomunitarias_servicios'
  | 'importaciones'
  | 'suplidos'
  | 'kit_digital'
  | 'no_aplica'
  | 'otro';

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  interiores_iva_deducible: 'Interiores IVA Deducible',
  facturas_compensaciones_agrarias: 'Facturas Compensaciones Agrarias',
  adquisiciones_intracomunitarias_bienes: 'Adquisiciones Intracomunitarias de Bienes',
  inversion_sujeto_pasivo: 'Inversión del Sujeto Pasivo',
  iva_no_deducible: 'IVA No Deducible',
  adquisiciones_intracomunitarias_servicios: 'Adquisiciones Intracomunitarias de Servicios',
  importaciones: 'Importaciones',
  suplidos: 'Suplidos',
  kit_digital: 'Kit Digital (Subvención)',
  no_aplica: 'No Aplica',
  otro: 'Otro',
};

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  emitida: 'Emitida',
  recibida: 'Recibida',
  proforma: 'Proforma',
};

export interface ExtractedInvoiceData {
  idioma?: string;
  moneda?: string;
  fecha_factura?: string;
  subtotal?: number;
  total?: number;
  impuestos?: number;
  porcentaje_iva?: number;
  descripcion?: string;
  nombre_emisor?: string;
  id_emisor?: string;
  nombre_receptor?: string;
  id_receptor?: string;
  direccion_emisor?: string;
  direccion_receptor?: string;
  codigo_postal_emisor?: string;
  codigo_postal_receptor?: string;
  factura_exenta?: boolean;
  motivo_exencion?: string;
  numero_factura?: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: 'pdf' | 'image';
  client_name: string | null;
  invoice_type: InvoiceType | null;
  operation_type: OperationType | null;
  classification_status: ClassificationStatus;
  classification_details: {
    confidence?: number;
    raw_response?: string;
    extracted_data?: ExtractedInvoiceData;
    reasoning?: string;
  } | null;
  feedback_status: 'correct' | 'corrected' | null;
  assigned_account: string | null;
  created_at: string;
  updated_at: string;
}
