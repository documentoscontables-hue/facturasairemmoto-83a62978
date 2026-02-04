export type InvoiceType = 'emitida' | 'recibida';

export type ClassificationStatus = 'pending' | 'classified' | 'error';

export type OperationType = 
  | 'adquisiciones_intracomunitarias'
  | 'intereses_iva_deducible'
  | 'gastos_generales'
  | 'servicios_profesionales'
  | 'suministros'
  | 'alquileres'
  | 'inversiones'
  | 'otros';

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  adquisiciones_intracomunitarias: 'Adquisiciones Intracomunitarias',
  intereses_iva_deducible: 'Intereses IVA Deducible',
  gastos_generales: 'Gastos Generales',
  servicios_profesionales: 'Servicios Profesionales',
  suministros: 'Suministros',
  alquileres: 'Alquileres',
  inversiones: 'Inversiones',
  otros: 'Otros',
};

export interface Invoice {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: 'pdf' | 'image';
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
    };
  } | null;
  created_at: string;
  updated_at: string;
}
