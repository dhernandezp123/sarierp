# Ensayo de navegador aislado de la auditoría

Se usan los componentes reales del repositorio dentro de una aplicación fixture
separada. Sin credenciales de negocio, sin usuarios reales y sin API remota:
Supabase apunta a 127.0.0.1:59999, interceptado por CDP. El API de historial es
un fixture local sin persistencia. No equivale a UAT autenticada de Production.

No requiere Playwright, plugins ni dependencias nuevas. Reutiliza Next/React,
Chrome/Edge instalado y el WebSocket nativo de Node 22+.

## Reproducción en PowerShell

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:59999'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-fixture-key'
$env:APP_ENV='demo'
$env:NEXT_PUBLIC_APP_ENV='demo'
node node_modules/next/dist/bin/next build tests/browser/fixture-app --webpack
node node_modules/next/dist/bin/next start tests/browser/fixture-app --hostname 127.0.0.1 --port 3116
```

En otra terminal, iniciar Chrome con perfil NUEVO dentro de .ua/intermediate,
modo headless y --remote-debugging-port=9237. Usar una ruta absoluta al perfil,
--no-first-run y --no-default-browser-check. En Windows, si se usa Start-Process,
especificar -WindowStyle Hidden. Nunca conectar el script al perfil habitual ni
a una sesión del usuario; cerrar solamente los procesos creados para el ensayo.

```powershell
node scripts/validate-browser-guards.mjs
```

El fixture detecta hidratación antes de interactuar. El resultado se guarda en
`.ua/intermediate/audit-browser-results.json`, sin datos personales. Se interceptan
las solicitudes ficticias de leads con error/éxito; no hay envío comercial real.
Para demostrar doble envío se disparan dos submits en el mismo turno del evento.

## Cobertura

- Un control ajeno no marca dirty; enlaces y Cancelar conservan el texto cuando
  se decide seguir editando. Un guardado fallido mantiene protección.
- Atrás se cancela o confirma y conserva el destino exacto; guardado confirmado
  permite salir. Se usa Navigation API del navegador instalado, no un mock.
- Editor manual conserva datos al usar sidebar y conserva su diálogo de reemplazo.
  Ancho de 390 px sin overflow del documento.
- Landing conserva campos tras error interceptado; reintento confirmado y doble
  clic no duplican. Eventos contienen etapas/duración sin valores de campos.

El fixture compilado se excluye de Vercel junto con pruebas de navegador. No se
publican rutas sintéticas dentro del ERP. Para los hitos comerciales/financieros
con sesión real seguir la matriz de release. El administrador del sistema será
el responsable de aceptación funcional y confirmación de SLA, según su indicación.
