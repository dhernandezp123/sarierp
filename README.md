# Sari Express ERP

ERP logístico para freight forwarders desarrollado para Sari Express: cotizaciones, pricing, operaciones, facturación fiscal (CAI Honduras), cuentas por cobrar/pagar, consolidación Miami y portal de clientes.

## Stack

- Next.js 16 (App Router, sesión SSR con cookies)
- TypeScript
- TailwindCSS
- Supabase (Postgres, Auth, RLS, migraciones versionadas)
- Sonner (toasts) y Lucide React (iconos)

## Requisitos

- Node.js 20+
- Cuenta y proyecto de Supabase (o stack local con `npx supabase start`, requiere Docker)
- Variables de entorno en `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # solo para rutas API administrativas
NEXT_PUBLIC_SITE_URL=...        # callbacks de invitación y recuperación
```

## Desarrollo

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Validaciones obligatorias antes de commitear

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Base de datos

Las migraciones viven en `supabase/migrations/` y deben ser versionadas e idempotentes. Pruebas SQL en `supabase/tests/` y auditorías de solo lectura en `supabase/preflight/`.

```bash
npx supabase db reset --local        # reconstruir base local
npx supabase db lint --local --level error
npx supabase db push --linked --dry-run   # verificar pendientes contra remoto
```

## Estructura principal

- `src/app/(protected)/` — ERP interno (dashboard, cotizaciones, pricing, operaciones, facturación, reportes, Miami)
- `src/app/portal/` — portal de clientes (envíos, paquetes, pre-alertas, pickup)
- `src/components/pdf/` — PDFs comerciales y operativos
- `src/lib/` — helpers compartidos (permisos, notificaciones, formato de fecha/moneda)
- `src/proxy.ts` — protección de rutas con sesión SSR (convención proxy de Next 16)

## Documentación del proyecto

- `AGENTS.md` — arquitectura, convenciones y reglas de trabajo
- `HARDENING.md` — registro versionado de hallazgos y correcciones de seguridad, integridad y calidad

## Convenciones clave

- Moneda: `USD 5,865.00` · Fechas: `DD/MM/YYYY` (helpers en `src/lib/format.ts`)
- No usar `alert()` ni `window.confirm()`; usar Sonner o modal custom
- Todo fix de seguridad/integridad se registra en `HARDENING.md` en el mismo commit
