import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  FileSpreadsheet, 
  Trash2, 
  Loader2, 
  CheckCircle2,
  BookOpen,
  AlertCircle
} from 'lucide-react';
import { useAccountBook } from '@/hooks/useAccountBook';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export function AccountBookUploader() {
  const { 
    accountBook, 
    accounts, 
    isLoading,
    uploadAccountBook, 
    isUploading,
    isParsingBook,
    deleteAccountBook,
    isDeleting,
    hasAccountBook 
  } = useAccountBook();
  
  const [isAccountsOpen, setIsAccountsOpen] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      await uploadAccountBook(acceptedFiles[0]);
    }
  }, [uploadAccountBook]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: isUploading || isParsingBook,
  });

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Libro de Cuentas</CardTitle>
          </div>
          {hasAccountBook && (
            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Activo
            </Badge>
          )}
        </div>
        <CardDescription>
          {hasAccountBook 
            ? 'La conciliación de cuentas está activa. Las facturas se asignarán automáticamente.'
            : 'Sube tu libro de cuentas (PDF/Excel) para activar la conciliación automática.'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAccountBook && accountBook ? (
          <>
            {/* Current book info */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium text-sm truncate max-w-[200px]">
                    {accountBook.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {accounts.length} cuentas • Subido el {new Date(accountBook.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={isDeleting}>
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-destructive" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar libro de cuentas?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se eliminarán todas las cuentas y la conciliación automática dejará de funcionar. 
                      Las facturas ya clasificadas mantendrán su cuenta asignada.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteAccountBook()}>
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Preview accounts */}
            <Collapsible open={isAccountsOpen} onOpenChange={setIsAccountsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-sm">
                  Ver cuentas ({accounts.length})
                  <span className={`transition-transform ${isAccountsOpen ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
                  {accounts.slice(0, 50).map((account) => (
                    <div 
                      key={account.id} 
                      className="flex items-center gap-2 text-xs p-2 bg-background rounded border"
                    >
                      <Badge variant="secondary" className="font-mono">
                        {account.account_code}
                      </Badge>
                      <span className="truncate">{account.account_description}</span>
                    </div>
                  ))}
                  {accounts.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      ... y {accounts.length - 50} cuentas más
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Replace book */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
            >
              <input {...getInputProps()} />
              <p className="text-xs text-muted-foreground">
                Arrastra un nuevo libro para reemplazar
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Upload dropzone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                ${isUploading || isParsingBook ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              
              {isUploading || isParsingBook ? (
                <div className="space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                  <div>
                    <p className="text-sm font-medium">
                      {isParsingBook ? 'Extrayendo cuentas...' : 'Subiendo archivo...'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Esto puede tardar unos segundos
                    </p>
                  </div>
                  <Progress value={isParsingBook ? 60 : 30} className="w-full max-w-xs mx-auto" />
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">
                    {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra tu libro de cuentas'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF o Excel con código y descripción de cuentas
                  </p>
                </>
              )}
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Sin libro de cuentas, las facturas se clasificarán normalmente pero sin asignar cuenta contable.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
