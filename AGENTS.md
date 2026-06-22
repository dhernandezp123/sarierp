<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

# Sari Express ERP

## Proyecto

ERP logístico desarrollado para Sari Express.

Stack principal:

* Next.js 16
* TypeScript
* TailwindCSS
* Supabase
* React
* Sonner
* Lucide React

---

## Reglas generales

Antes de modificar código:

1. Leer este archivo completo.
2. Buscar implementaciones similares antes de crear nuevas.
3. Reutilizar componentes existentes cuando sea posible.
4. No introducir librerías nuevas sin aprobación.
5. Mantener consistencia visual con el resto del ERP.
6. No usar alert().
7. No usar window.confirm().
8. Utilizar Sonner o modal custom.
9. Mantener TypeScript sin errores.

Siempre ejecutar:

```bash
npx tsc --noEmit
```

al finalizar cambios.

### Registro de hardening

Todo fix relacionado con seguridad, integridad de datos, flujos, reportes,
UX, calidad o ambiente Trial debe registrarse en `HARDENING.md` en el mismo
commit del cambio.

El registro debe incluir:

* ID del hallazgo
* Estado
* Archivos y SQL modificados
* Validaciones ejecutadas
* Riesgos o trabajo pendiente
* Hash del commit cuando esté disponible

No marcar un hallazgo como completado si falta ejecutar SQL, verificar RLS,
probar el flujo o documentar una acción manual.

---

## Arquitectura

### Cotizaciones

Tabla principal:

```txt
quotations
```

Estados principales:

```txt
Pendiente de Fijar Precios
Cotizada
Aprobada
Rechazada
Convertida a Shipment
```

### Pricing

Tabla:

```txt
agent_quotes
```

Una cotización puede tener múltiples tarifas de agentes.

Campos importantes:

```txt
carrier
transit_time
transshipment
free_days_destination
etd
valid_until
exw_cost
mbl_fee
```

Solo una tarifa puede estar:

```txt
is_selected = true
```

---

## Observaciones

### pricing_notes

Uso interno.

Las escribe Ventas.

NO aparecen en PDF.

### client_notes

Uso comercial.

Las escribe Pricing.

SI aparecen en PDF.

---

## PDF Comercial

Archivo principal:

```txt
src/components/pdf/quotation-pdf.tsx
```

Debe mostrar:

* ETD
* Carrier
* Tránsito
* Días libres
* Transbordo
* Incoterm
* Origen
* Destino

No mostrar:

* pricing_notes

Sí mostrar:

* client_notes

---

## Multicontenedor

FCL y FTL utilizan:

```txt
quotation_containers
```

No utilizar:

```txt
container_type
container_qty
```

como fuente principal.

Son legacy.

---

## Carga Suelta

LCL
LTL
Courier
Aéreo Consolidado

Utilizan:

```txt
quotation_cargo_lines
```

No usan líneas multicontenedor.

---

## Operaciones

Flujo:

```txt
Cotización
→ Pricing
→ Shipment
→ Shipping Instruction
→ Booking
→ Operación
```

---

## UI

Formato monetario:

```txt
USD 5,865.00
```

Formato fecha:

```txt
DD/MM/YYYY
```

Nunca:

```txt
2026-06-14
```

---

## Antes de tocar un módulo

Buscar primero:

* Implementación existente
* Helpers existentes
* Componentes reutilizables

Evitar duplicar lógica.
