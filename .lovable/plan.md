

## Cambio en reglas de deteccion de tickets

Se modificara el texto del prompt de clasificacion en la Edge Function para que en lugar de exigir que el documento cumpla **TODAS** las caracteristicas de ticket, se exija que cumpla **la MAYORIA**.

### Archivos a modificar

1. **`supabase/functions/classify-invoice/index.ts`** (linea 36)
   - Cambiar: `"cumpla TODAS estas características"`
   - Por: `"cumpla la MAYORÍA de estas características"`

2. **`vps-backend/src/services/gemini.ts`** (linea 23)
   - Mismo cambio para mantener ambos archivos sincronizados.

### Impacto

Este cambio hara que la IA sea mas flexible al clasificar tickets, permitiendo que documentos que cumplan la mayoria (pero no necesariamente todas) las caracteristicas sean clasificados como ticket. Esto reduce falsos negativos donde un ticket real se clasificaba incorrectamente por no cumplir alguna condicion menor.

