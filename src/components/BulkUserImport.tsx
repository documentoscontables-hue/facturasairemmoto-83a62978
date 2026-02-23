import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { useAdmin } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

const rowSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  role: z.enum(['admin', 'coordinador', 'user'], { errorMap: () => ({ message: 'Rol inválido (admin, coordinador, user)' }) }),
  team: z.string().optional(),
});

interface ParsedUser {
  email: string;
  password: string;
  role: string;
  team: string;
  error?: string;
}

interface ImportResult {
  email: string;
  success: boolean;
  error?: string;
}

export function BulkUserImport() {
  const { teams, createUser } = useAdmin();
  const [isOpen, setIsOpen] = useState(false);
  const [parsedUsers, setParsedUsers] = useState<ParsedUser[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload');

  const reset = () => {
    setParsedUsers([]);
    setResults([]);
    setProgress(0);
    setStep('upload');
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

        if (rows.length === 0) {
          toast.error('El archivo está vacío');
          return;
        }

        const parsed: ParsedUser[] = rows.map((row, i) => {
          // Normalize column names (case-insensitive, trim)
          const normalized: Record<string, string> = {};
          Object.entries(row).forEach(([key, val]) => {
            normalized[key.trim().toLowerCase()] = String(val).trim();
          });

          const email = normalized['email'] || normalized['correo'] || '';
          const password = normalized['password'] || normalized['contraseña'] || normalized['contrasena'] || '';
          const role = (normalized['role'] || normalized['rol'] || 'user').toLowerCase();
          const team = normalized['team'] || normalized['equipo'] || '';

          // Validate
          const result = rowSchema.safeParse({ email, password, role, team: team || undefined });

          return {
            email,
            password,
            role,
            team,
            error: result.success ? undefined : result.error.errors[0].message,
          };
        });

        setParsedUsers(parsed);
        setStep('preview');
      } catch {
        toast.error('Error al leer el archivo Excel');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const validUsers = parsedUsers.filter(u => !u.error);
  const invalidUsers = parsedUsers.filter(u => !!u.error);

  const handleImport = async () => {
    if (validUsers.length === 0) return;
    setIsImporting(true);
    setStep('results');
    const importResults: ImportResult[] = [];

    for (let i = 0; i < validUsers.length; i++) {
      const u = validUsers[i];
      try {
        // Find team_id by name
        const teamMatch = u.team ? teams.find(t => t.name.toLowerCase() === u.team.toLowerCase()) : null;

        await createUser({
          email: u.email,
          password: u.password,
          role: u.role,
          team_id: teamMatch?.id,
        });
        importResults.push({ email: u.email, success: true });
      } catch (err: any) {
        importResults.push({ email: u.email, success: false, error: err.message });
      }
      setProgress(Math.round(((i + 1) / validUsers.length) * 100));
      setResults([...importResults]);
    }

    setIsImporting(false);
    const successCount = importResults.filter(r => r.success).length;
    const failCount = importResults.filter(r => !r.success).length;
    if (failCount === 0) {
      toast.success(`${successCount} usuarios creados exitosamente`);
    } else {
      toast.warning(`${successCount} creados, ${failCount} fallidos`);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['email', 'password', 'role', 'team'],
      ['usuario1@ejemplo.com', 'Pass123!', 'user', 'Equipo A'],
      ['coordinador1@ejemplo.com', 'Pass123!', 'coordinador', 'Equipo B'],
      ['admin1@ejemplo.com', 'Pass123!', 'admin', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    XLSX.writeFile(wb, 'plantilla_usuarios.xlsx');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Usuarios desde Excel</DialogTitle>
          <DialogDescription>
            Sube un archivo Excel (.xlsx, .xls) o CSV con las columnas requeridas
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <Card className="border-dashed border-2">
              <CardContent className="p-6">
                <div
                  {...getRootProps()}
                  className={`flex flex-col items-center justify-center gap-3 py-8 cursor-pointer rounded-lg transition-colors ${
                    isDragActive ? 'bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="w-10 h-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">
                    {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra un archivo Excel o haz clic para seleccionar'}
                  </p>
                  <p className="text-xs text-muted-foreground">Formatos: .xlsx, .xls, .csv</p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Formato requerido del archivo
              </h4>
              <p className="text-xs text-muted-foreground">
                El archivo debe tener las siguientes columnas en la primera fila (encabezados):
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Columna</TableHead>
                      <TableHead className="text-xs">Obligatorio</TableHead>
                      <TableHead className="text-xs">Descripción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-xs font-mono">email</TableCell>
                      <TableCell><Badge variant="destructive" className="text-[10px]">Sí</Badge></TableCell>
                      <TableCell className="text-xs">Correo del usuario (ej: user@empresa.com)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs font-mono">password</TableCell>
                      <TableCell><Badge variant="destructive" className="text-[10px]">Sí</Badge></TableCell>
                      <TableCell className="text-xs">Contraseña (mínimo 6 caracteres)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs font-mono">role</TableCell>
                      <TableCell><Badge variant="destructive" className="text-[10px]">Sí</Badge></TableCell>
                      <TableCell className="text-xs">Rol: <code className="text-[10px] bg-muted px-1 rounded">user</code>, <code className="text-[10px] bg-muted px-1 rounded">coordinador</code> o <code className="text-[10px] bg-muted px-1 rounded">admin</code></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs font-mono">team</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">No</Badge></TableCell>
                      <TableCell className="text-xs">Nombre del equipo (debe existir previamente)</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                También acepta encabezados en español: <code className="bg-muted px-1 rounded text-[10px]">correo</code>, <code className="bg-muted px-1 rounded text-[10px]">contraseña</code>, <code className="bg-muted px-1 rounded text-[10px]">rol</code>, <code className="bg-muted px-1 rounded text-[10px]">equipo</code>
              </p>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="w-3 h-3 mr-2" />
                Descargar plantilla
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 flex-1 min-h-0">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{parsedUsers.length} filas detectadas</Badge>
              <Badge className="bg-emitida/10 text-emitida">{validUsers.length} válidos</Badge>
              {invalidUsers.length > 0 && (
                <Badge variant="destructive">{invalidUsers.length} con errores</Badge>
              )}
            </div>

            <ScrollArea className="h-[300px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-8">#</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Rol</TableHead>
                    <TableHead className="text-xs">Equipo</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedUsers.map((u, i) => (
                    <TableRow key={i} className={u.error ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-mono">{u.email || '—'}</TableCell>
                      <TableCell className="text-xs">{u.role || '—'}</TableCell>
                      <TableCell className="text-xs">{u.team || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {u.error ? (
                          <span className="text-destructive flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> {u.error}
                          </span>
                        ) : (
                          <span className="text-emitida flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> OK
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button
                onClick={handleImport}
                disabled={validUsers.length === 0}
                className="gradient-primary"
              >
                <Upload className="w-4 h-4 mr-2" />
                Importar {validUsers.length} usuarios
              </Button>
            </div>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-4 flex-1 min-h-0">
            {isImporting && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Creando usuarios... {progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            <ScrollArea className="h-[300px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{r.email}</TableCell>
                      <TableCell className="text-xs">
                        {r.success ? (
                          <span className="text-emitida flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Creado
                          </span>
                        ) : (
                          <span className="text-destructive flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> {r.error}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {!isImporting && (
              <div className="flex justify-end">
                <Button onClick={() => { reset(); setIsOpen(false); }}>Cerrar</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
