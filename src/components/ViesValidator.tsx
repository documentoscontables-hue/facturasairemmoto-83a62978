import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { Loader2, Search, CheckCircle2, XCircle, Clock, Trash2, ExternalLink, Building2, Truck } from 'lucide-react';
import { toast } from 'sonner';

const EU_COUNTRIES = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croacia' },
  { code: 'CY', name: 'Chipre' },
  { code: 'CZ', name: 'Chequia' },
  { code: 'DK', name: 'Dinamarca' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finlandia' },
  { code: 'FR', name: 'Francia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'EL', name: 'Grecia' },
  { code: 'HU', name: 'Hungría' },
  { code: 'IE', name: 'Irlanda' },
  { code: 'IT', name: 'Italia' },
  { code: 'LV', name: 'Letonia' },
  { code: 'LT', name: 'Lituania' },
  { code: 'LU', name: 'Luxemburgo' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Países Bajos' },
  { code: 'PL', name: 'Polonia' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Rumanía' },
  { code: 'SK', name: 'Eslovaquia' },
  { code: 'SI', name: 'Eslovenia' },
  { code: 'ES', name: 'España' },
  { code: 'SE', name: 'Suecia' },
];

interface ViesQueryResult {
  id: string;
  fullVat: string;
  countryCode: string;
  vatNumber: string;
  valid: boolean;
  name?: string;
  address?: string;
  entityType: 'cliente' | 'proveedor';
  timestamp: Date;
  error?: string;
}

export function ViesValidator() {
  const [countryCode, setCountryCode] = useState('ES');
  const [vatNumber, setVatNumber] = useState('');
  const [entityType, setEntityType] = useState<'cliente' | 'proveedor'>('cliente');
  const [isValidating, setIsValidating] = useState(false);
  const [queryHistory, setQueryHistory] = useState<ViesQueryResult[]>([]);
  const [currentResult, setCurrentResult] = useState<ViesQueryResult | null>(null);

  const handleValidate = async () => {
    if (!vatNumber.trim()) {
      toast.error('Introduce un número de IVA');
      return;
    }

    setIsValidating(true);
    try {
      const data = await apiFetch<any>('/api/vies/validate', {
        method: 'POST',
        body: JSON.stringify({ countryCode, vatNumber: vatNumber.trim() }),
      });

      const result: ViesQueryResult = {
        id: crypto.randomUUID(),
        fullVat: `${countryCode}${vatNumber.trim()}`,
        countryCode,
        vatNumber: vatNumber.trim(),
        valid: data.valid,
        name: data.name,
        address: data.address,
        entityType,
        timestamp: new Date(),
        error: data.error,
      };

      setCurrentResult(result);
      setQueryHistory(prev => [result, ...prev]);

      if (data.valid) {
        toast.success('NIF registrado en VIES');
      } else {
        toast.warning('NIF NO registrado en VIES');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(`Error al consultar VIES: ${msg}`);
    } finally {
      setIsValidating(false);
    }
  };

  const clearHistory = () => {
    setQueryHistory([]);
    setCurrentResult(null);
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Main form */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Consultar número de IVA</CardTitle>
                <CardDescription>
                  Verifica si un cliente o proveedor está registrado en el sistema VIES de la UE.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>País</Label>
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EU_COUNTRIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Número de IVA</Label>
                <Input
                  value={vatNumber}
                  onChange={e => setVatNumber(e.target.value)}
                  placeholder="B12345678"
                  onKeyDown={e => e.key === 'Enter' && handleValidate()}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de entidad</Label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={entityType === 'cliente' ? 'default' : 'outline'}
                  onClick={() => setEntityType('cliente')}
                  className="flex-1"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Cliente
                </Button>
                <Button
                  type="button"
                  variant={entityType === 'proveedor' ? 'default' : 'outline'}
                  onClick={() => setEntityType('proveedor')}
                  className="flex-1"
                >
                  <Truck className="w-4 h-4 mr-2" />
                  Proveedor
                </Button>
              </div>
            </div>

            <Button
              onClick={handleValidate}
              disabled={isValidating || !vatNumber.trim()}
              className="w-full gradient-primary"
              size="lg"
            >
              {isValidating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Validar en VIES
            </Button>
          </CardContent>
        </Card>

        {/* Current result */}
        {currentResult && (
          <Card className={`border-2 ${currentResult.valid ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20' : 'border-destructive/30 bg-red-50/50 dark:bg-red-950/20'}`}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                {currentResult.valid ? (
                  <CheckCircle2 className="w-8 h-8 text-green-500 flex-shrink-0 mt-1" />
                ) : (
                  <XCircle className="w-8 h-8 text-destructive flex-shrink-0 mt-1" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold">
                      {currentResult.valid ? 'Registrado en VIES' : 'No registrado en VIES'}
                    </h3>
                    <Badge variant={currentResult.entityType === 'cliente' ? 'default' : 'secondary'}>
                      {currentResult.entityType === 'cliente' ? 'Cliente' : 'Proveedor'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground font-mono mt-1">{currentResult.fullVat}</p>
                  {currentResult.name && currentResult.name !== '---' && (
                    <p className="mt-2 font-medium">{currentResult.name}</p>
                  )}
                  {currentResult.address && currentResult.address !== '---' && (
                    <p className="text-sm text-muted-foreground">{currentResult.address}</p>
                  )}
                  {currentResult.error && (
                    <p className="text-sm text-destructive mt-2">{currentResult.error}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Link to official VIES */}
        <div className="flex justify-center">
          <a
            href="https://ec.europa.eu/taxation_customs/vies/#/vat-validation"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            VIES Oficial
          </a>
        </div>
      </div>

      {/* Query history sidebar */}
      <div className="lg:col-span-1">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm">Historial de consultas</CardTitle>
              </div>
              {queryHistory.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearHistory} className="h-7 text-xs">
                  <Trash2 className="w-3 h-3 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {queryHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin consultas aún
              </p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {queryHistory.map(q => (
                  <div
                    key={q.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                      currentResult?.id === q.id ? 'bg-muted/50 border-primary/30' : ''
                    }`}
                    onClick={() => setCurrentResult(q)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {q.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                      )}
                      <span className="font-mono text-sm truncate">{q.fullVat}</span>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0 ml-2">
                      {q.entityType === 'cliente' ? 'Cliente' : 'Proveedor'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
