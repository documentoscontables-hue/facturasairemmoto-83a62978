export type InvoiceType = 'emitida' | 'recibida';

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
  otro: 'Otro',
};

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
    extracted_data?: {
      vendor?: string;
      amount?: number;
      date?: string;
      invoice_number?: string;
      emisor_nif?: string;
      receptor_nif?: string;
    };
  } | null;
  created_at: string;
  updated_at: string;
}
