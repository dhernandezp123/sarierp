# Consola de plataforma — publicación del 26/10/2026

La consola de superadministrador se publicó en `forwarders.app/platform`. El
login raíz dirige a ella; los usuarios de empresa continúan usando su dominio.

## Versión y base de datos

- Commit funcional: `87017ae7257fed891ada33eacb3d60528498e7fc`.
- Proyecto Supabase: `fwspgdzvlbtbgiupvrzo`, Production verificado.
- Migración aplicada: `20261026160000_platform_admin_console.sql`, antes de
  publicar el frontend. No se aplicaron otras migraciones pendientes.
- Fuente del commit registrada en `supabase_migrations.schema_migrations`.
  SHA-256: `ecf988f7425641f8e4b194802cc62b9e022933b49e99c9a36d6a18686f25d76c`.
- Aplicación transaccional con comprobación de versión anterior, helper de
  tenant, ambiente y SQL exacto. Huellas de las 25 tablas verificadas idénticas
  antes/después, incluidas empresas, perfiles, clientes, cotizaciones, facturas,
  CAI, configuración y actividad. Políticas y ACL existentes sin cambios.
- Nueva auditoría protegida por RLS; anon no puede ejecutar la consola y
  authenticated no puede insertar eventos directamente.

## Autorización y disponibilidad

La verificación SQL de solo lectura usó rol authenticated y claims de la cuenta
de plataforma previamente habilitada: resumen y directorios disponibles,
contexto operativo nulo y cero clientes comerciales visibles. Un Admin de Sari
no pudo ejecutar la consola y conservó el contexto operativo de su empresa.
No se hicieron altas, suspensiones ni cambios de usuarios ficticios en Production.

- Vercel Production: `dpl_BpuBiwqfmanozJwbFvP1WWmSS5gq`, estado exitoso.
- Instancia: `https://sarierp-22s9ridh4-claudherhn-5641s-projects.vercel.app`.
- Build: `Kd2AieFGLd15gCz42TsA2`; manifiesto idéntico en raíz, Sari e instancia.
- Smoke del 26/10/2026 a las 21:26 UTC: login raíz y Sari 200; consola sin sesión
  307 hacia login; API raíz sin sesión 401; POST de origen ajeno 403; consola/API
  global solicitadas desde Sari 404; cotización de Sari sin sesión 307.

## Validación y pendientes

- Local: 417 pruebas Node, TypeScript, build y lint sin regresiones; 20 suites
  SQL/RLS y prueba concurrente que conserva al último administrador activo.
- [Quality CI `40403957842`](https://github.com/dhernandezp123/sarierp/actions/runs/40403957842)
  aprobado: application `121856785173` y database `121856784843` exitosos,
  incluidas las suites SQL/RLS sobre una base desechable creada desde cero.
- La evidencia operativa detallada quedó localmente bajo
  `.ua/intermediate/platform-release-20261026/`; no contiene contraseñas.
- Pendiente: login manual con contraseña y matriz de aceptación completa en
  [el guion UAT](../uat/platform-admin-console.md). SQL con claims y smoke sin
  sesión no certifican el recorrido autenticado del frontend.
- El alta de empresas registra el dominio, pero DNS/TLS/alojamiento y callbacks
  de Auth deben verificarse; no se copian datos privados de Sari.

Si fuera necesario revertir el frontend, conservar la auditoría y las acciones
administrativas ya realizadas. No eliminar eventos ni restablecer estados de
empresas como efecto de una reversión técnica.
