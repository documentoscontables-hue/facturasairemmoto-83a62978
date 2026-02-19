
## Diagnóstico: Dos problemas críticos identificados

### Problema 1: Facturas que quedan sin clasificar

El `classifyWithRetry` en `useInvoices.tsx` solo reintenta en errores 429/503 (rate limit). Cuando el servidor devuelve un **500** (ej: timeout de la función, error de red, "Invalid AI response format"), el error se ignora y la factura queda permanentemente sin clasificar — no hay fallback ni reintento.

Además, la concurrencia de 3 workers simultáneos puede saturar la API de Gemini y generar más errores 500.

### Problema 2: Detección de duplicados no funciona en clasificación masiva

La función `detectDuplicate` en el edge function busca en la base de datos invoices ya clasificadas con `extracted_data`. El problema es que con 3 workers procesando en paralelo:

- La **factura A** se está procesando al mismo tiempo que la **factura B** (su duplicada).
- Cuando la factura B consulta la DB para detectar duplicados, la factura A aún NO ha sido guardada en la base de datos.
- Por lo tanto, nunca se detectan como duplicadas porque ninguna ve a la otra al momento de la consulta.

### Solución Propuesta

#### Fix 1: Clasificación robusta — reintentar TODOS los errores, no solo rate limits

En `src/hooks/useInvoices.tsx`, cambiar la lógica del `classifyWithRetry` para:
- Reintentar **cualquier error** (no solo 429/503), incluyendo errores 500.
- Reducir la concurrencia de 3 a **2 workers** para evitar saturar la API.
- Si después de todos los intentos sigue fallando, marcar la factura con un estado de error visible en lugar de silenciosamente ignorarla.

#### Fix 2: Serializar la clasificación para que los duplicados se detecten correctamente

El problema de los duplicados es inherente al procesamiento paralelo. La solución es cambiar la estrategia:

- **Reducir concurrencia a 1** (procesamiento secuencial) cuando hay múltiples facturas, lo que garantiza que cada factura nueva ya encontrará las anteriores guardadas en DB al verificar duplicados.

O alternativamente:
- **Mantener un caché en memoria** en el edge function con los datos de las facturas ya clasificadas en la sesión actual. Pero esto no funciona porque cada invocación del edge function es independiente.

La opción más confiable es **procesar de forma secuencial** (CONCURRENCY = 1). Aunque parece más lento, en la práctica con Gemini 2.5 Flash cada clasificación tarda ~5-15 segundos, y el cuello de botella real es la API de Gemini, no la concurrencia.

#### Fix 3: Mejorar la detección de duplicados en el edge function

La consulta de duplicados actualmente excluye `invoice_type = 'duplicada'` pero también debería comparar contra facturas que aún estén **pending** y ya tengan datos extraídos de una clasificación previa — aunque el problema principal se resuelve con la serialización.

También se debe mejorar la consulta para **no requerir** `classification_status = 'classified'`, sino buscar en cualquier factura que tenga `classification_details` con `extracted_data`, incluyendo las recién clasificadas.

### Archivos a modificar

1. **`src/hooks/useInvoices.tsx`**:
   - Cambiar `CONCURRENCY` de 3 a **1** (secuencial) para garantizar detección de duplicados
   - Hacer que `classifyWithRetry` reintente en **cualquier error** (no solo rate limits), con backoff exponencial
   - Aumentar `maxRetries` de 4 a **5** para mayor robustez

2. **`supabase/functions/classify-invoice/index.ts`**:
   - Modificar `detectDuplicate` para buscar en **todas las facturas clasificadas** (no solo las que tienen `classification_status = 'classified'`), incluyendo las que tienen `invoice_type` distinto de `duplicada` y tienen `extracted_data`
   - Bajar el umbral mínimo de score de duplicado de **5 a 4** para ser menos estricto (actualmente el score de factura con mismo número+emisor+total = 7, pero a veces la fecha no coincide exactamente)
   - Agregar log detallado cuando NO se detecta un duplicado para facilitar debugging

### Resumen visual del flujo corregido

```text
ANTES (con 3 workers en paralelo):
Worker 1: Clasifica Factura A → guarda en DB
Worker 2: Clasifica Factura B (duplicada de A) → consulta DB → A aún no está → NO detecta duplicado
Worker 3: Clasifica Factura C

DESPUÉS (con 1 worker secuencial):
Step 1: Clasifica Factura A → guarda en DB
Step 2: Clasifica Factura B → consulta DB → A ya está guardada → DETECTA DUPLICADO ✓
Step 3: Clasifica Factura C
```

El procesamiento secuencial es la única forma confiable de detectar duplicados en tiempo real sin necesidad de una segunda pasada de verificación post-clasificación.
