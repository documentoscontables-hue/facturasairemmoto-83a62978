import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, FileText } from 'lucide-react';
import type { ClassificationProgress as ProgressType } from '@/hooks/useInvoices';

interface ClassificationProgressProps {
  progress: ProgressType;
}

export function ClassificationProgress({ progress }: ClassificationProgressProps) {
  const percentage = Math.round((progress.current / progress.total) * 100);
  
  return (
    <Card className="glass-card border-primary/20 bg-primary/5 animate-fade-in">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">
                Clasificando con IA...
              </span>
              <span className="text-sm text-muted-foreground">
                {progress.current} de {progress.total}
              </span>
            </div>
            
            <Progress value={percentage} className="h-2" />
            
            {progress.currentFileName && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="w-3 h-3" />
                <span className="truncate">{progress.currentFileName}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
