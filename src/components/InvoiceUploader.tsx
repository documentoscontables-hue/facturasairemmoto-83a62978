import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Image, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InvoiceUploaderProps {
  onUpload: (files: File[]) => Promise<unknown>;
  isUploading: boolean;
}

export function InvoiceUploader({ onUpload, isUploading }: InvoiceUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    disabled: isUploading,
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    await onUpload(files);
    setFiles([]);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
          isDragActive 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-primary/50 hover:bg-muted/50",
          isUploading && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium">
              {isDragActive ? "Suelta los archivos aquí" : "Arrastra facturas aquí"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF, JPG, PNG o WebP
            </p>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium">
            {files.length} archivo{files.length !== 1 ? 's' : ''} seleccionado{files.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map((file, index) => (
              <div 
                key={index} 
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
              >
                {file.type === 'application/pdf' ? (
                  <FileText className="w-5 h-5 text-destructive" />
                ) : (
                  <Image className="w-5 h-5 text-primary" />
                )}
                <span className="flex-1 truncate text-sm">{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 hover:bg-background rounded"
                  disabled={isUploading}
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
          <Button 
            onClick={handleUpload} 
            disabled={isUploading} 
            className="w-full gradient-primary"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Subir y clasificar
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
