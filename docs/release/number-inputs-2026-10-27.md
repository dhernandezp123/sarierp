# Publicación de edición numérica — 27/10/2026

## Cambio publicado

Commit funcional: `032cbbbe7e8677f367b507ca9d8a5f18af567e00`.
Hallazgo: `UX-NUM-01` en `HARDENING.md`.

Los campos afectados permiten borrar el cero y escribir decimales sin que el
formulario reponga el valor en cada pulsación. Se conserva el texto durante la
edición y se normaliza al salir. Cubre configuración de empresa/facturación,
agentes, catálogos, costos FCL y retiro Miami. El descuento por línea conserva
el vacío y calcula cero descuento; el ISV explícito de 0 % sigue siendo válido.

Guardar configuración rechaza tasas de cambio no positivas/no finitas,
impuestos fuera de 0–100 % y recargos negativos/no finitos antes de escribir.
No requiere migraciones ni modifica permisos, documentos existentes o el
estado de la contabilidad automática.

## Validación

- 441/441 pruebas Node; el caso de descuento se amplió y pasó nuevamente.
- TypeScript y build Next.js aprobados (100 páginas generadas).
- Lint: 463 archivos, 223 diagnósticos históricos, cero regresiones.
- Chrome aislado con datos ficticios: borrado, decimales, ceros finales,
  normalización, cero explícito y viewport móvil.
- [Quality CI 40583866907](https://github.com/dhernandezp123/sarierp/actions/runs/40583866907):
  aplicación y suites SQL/RLS aprobadas. El primer intento no pudo arrancar
  la base desechable por límites de descarga de imágenes (`toomanyrequests`);
  se reintentó únicamente ese trabajo y las suites pasaron en el intento 2.
  No se modificó código para resolver el incidente ni se probó en Production.

## Production

Vercel `3gvK52wnojZrQx4n1xdNY7cnYw8b`, exitoso; GitHub Deployment
`7370452711`, asociado al SHA funcional exacto. Instancia:
`https://sarierp-adu5mx2b9-claudherhn-5641s-projects.vercel.app`.
Build: `MKCGB6ICAVYeXe5rb19ry`.

Smoke sin sesión: 19 rutas/recursos aprobados; login, protección de módulos,
API sin sesión, rechazo de plataforma desde Sari y logo. Mismo manifiesto
en `forwarders.app`, `sari.forwarders.app` y la instancia inmutable.
Evidencia local en `.ua/intermediate/number-release-20261027/`.

Se revisaron los 12 archivos funcionales antes del push al repositorio público:
solo código, pruebas ficticias y registro técnico. No se incluyen PDF de
clientes, credenciales ni artefactos locales. Falta la aceptación del usuario
con una sesión real de Contabilidad; el smoke HTTP no sustituye esa prueba.
