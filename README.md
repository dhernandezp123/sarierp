# Sari Express ERP

ERP logístico para freight forwarders desarrollado para Sari Express: cotizaciones, pricing, operaciones, facturación fiscal (CAI Honduras), cuentas por cobrar/pagar, consolidación Miami y portal de clientes.

## Stack

- Next.js 16 (App Router, sesión SSR con cookies)
- TypeScript
- TailwindCSS
- Supabase (Postgres, Auth, RLS, migraciones versionadas)
- Sonner (toasts) y Lucide React (iconos)

## Requisitos

- Node.js 22 (igual que CI) y npm; usar `npm ci` con el lockfile versionado.
- Cuenta y proyecto de Supabase (o stack local con `npx supabase start`, requiere Docker)
- Copiar `config/development.env.example` a `.env.local` y reemplazar solamente
  las claves del stack local. [Guía por ambiente y capacidades](docs/setup-and-capabilities.md).
- Variables base (no son la configuración completa):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # solo para rutas API administrativas
NEXT_PUBLIC_SITE_URL=...        # callbacks de invitación y recuperación
```

## Desarrollo

```bash
npm ci
npm run dev
```

Abrir [http://sari.localhost:3000](http://sari.localhost:3000). El proxy resuelve
ese alias mediante `sari.forwarders.app` en tenant_domains; el tenant debe estar
activo en la base elegida. `localhost:3000` usa LOCAL_TENANT_HOSTNAME (fallback
Sari solo en desarrollo). Una instalación vacía no contiene usuarios aprobados.

## Validaciones obligatorias antes de commitear

```bash
npx tsc --noEmit
npm test
npm run lint:ci
npm run lint
npm run build
```

## Base de datos

Las migraciones viven en `supabase/migrations/` y deben ser versionadas e idempotentes. Pruebas SQL en `supabase/tests/` y auditorías de solo lectura en `supabase/preflight/`.

```bash
npx supabase start                 # requiere Docker y puertos locales libres
npx supabase db lint --local --level error
```

`db reset --local` destruye los datos locales del proyecto: usarlo únicamente
en un stack desechable identificado. No es un paso rutinario de desarrollo.
Las migraciones presentes en disco no prueban que estén desplegadas.

## Estructura principal

- `src/app/(protected)/` — ERP interno (dashboard, cotizaciones, pricing, operaciones, facturación, reportes, Miami)
- `src/app/portal/` — portal de clientes (envíos, paquetes, pre-alertas, pickup)
- `src/components/pdf/` — PDFs comerciales y operativos
- `src/lib/` — helpers compartidos (permisos, notificaciones, formato de fecha/moneda)
- `src/proxy.ts` — protección de rutas con sesión SSR (convención proxy de Next 16)

## Documentación del proyecto

- `AGENTS.md` — arquitectura, convenciones y reglas de trabajo
- `HARDENING.md` — registro versionado de hallazgos y correcciones de seguridad, integridad y calidad
- [Matriz de release/UAT](docs/release/audit-release-matrix.md) — estado por ambiente y aceptación pendiente
- [Controles continuos](docs/quality/continuous-checks.md) — CI y deuda explícita de lint
- [Capacidades y variables](docs/setup-and-capabilities.md) — correo, OCR, Outlook y documentos manuales

## Convenciones clave

- Moneda: `USD 5,865.00` · Fechas: `DD/MM/YYYY` (helpers en `src/lib/format.ts`)
- No usar `alert()` ni `window.confirm()`; usar Sonner o modal custom
- Todo fix de seguridad/integridad se registra en `HARDENING.md` en el mismo commit
