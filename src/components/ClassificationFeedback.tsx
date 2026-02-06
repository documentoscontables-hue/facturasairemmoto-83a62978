import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, ChevronRight } from 'lucide-react';
import { InvoiceType, OperationType, OPERATION_TYPE_LABELS } from '@/types/invoice';
import { cn } from '@/lib/utils';

interface ClassificationFeedbackProps {
  currentType: InvoiceType | null;
  currentOperation: OperationType | null;
  feedbackStatus: string | null;
  onFeedback: (isCorrect: boolean, correctedType?: InvoiceType, correctedOperation?: OperationType) => void;
  isSubmitting?: boolean;
}

export function ClassificationFeedback({
  currentType,
  currentOperation,
  feedbackStatus,
  onFeedback,
  isSubmitting = false,
}: ClassificationFeedbackProps) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctedType, setCorrectedType] = useState<InvoiceType | undefined>(undefined);
  const [correctedOperation, setCorrectedOperation] = useState<OperationType | undefined>(undefined);

  // If feedback was already given, show status
  if (feedbackStatus === 'correct') {
    return (
      <div className="flex items-center gap-2 text-sm text-success">
        <Check className="w-4 h-4" />
        <span>Clasificación correcta</span>
      </div>
    );
  }

  if (feedbackStatus === 'corrected') {
    return (
      <div className="flex items-center gap-2 text-sm text-primary">
        <Check className="w-4 h-4" />
        <span>Corrección guardada - gracias por mejorar el sistema</span>
      </div>
    );
  }

  const handleCorrect = () => {
    onFeedback(true);
  };

  const handleIncorrect = () => {
    setShowCorrection(true);
  };

  const handleSubmitCorrection = () => {
    if (correctedType && correctedOperation) {
      onFeedback(false, correctedType, correctedOperation);
      setShowCorrection(false);
    }
  };

  if (showCorrection) {
    return (
      <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-border">
        <p className="text-sm font-medium">¿Cuál es la clasificación correcta?</p>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Tipo correcto</label>
            <Select
              value={correctedType || ''}
              onValueChange={(value) => setCorrectedType(value as InvoiceType)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="emitida">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emitida" />
                    Emitida
                  </span>
                </SelectItem>
                <SelectItem value="recibida">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-recibida" />
                    Recibida
                  </span>
                </SelectItem>
                <SelectItem value="proforma">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                    Proforma
                  </span>
                </SelectItem>
                <SelectItem value="albaran">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                    Albarán
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Operación correcta</label>
            <Select
              value={correctedOperation || ''}
              onValueChange={(value) => setCorrectedOperation(value as OperationType)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OPERATION_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCorrection(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSubmitCorrection}
            disabled={!correctedType || !correctedOperation || isSubmitting}
          >
            {isSubmitting ? 'Guardando...' : 'Guardar corrección'}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">¿Clasificación correcta?</span>
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          "h-7 px-2 text-success hover:text-success hover:bg-success/10"
        )}
        onClick={handleCorrect}
        disabled={isSubmitting}
      >
        <Check className="w-4 h-4 mr-1" />
        Sí
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          "h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
        )}
        onClick={handleIncorrect}
        disabled={isSubmitting}
      >
        <X className="w-4 h-4 mr-1" />
        No
      </Button>
    </div>
  );
}
