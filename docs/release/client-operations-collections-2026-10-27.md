# Operaciones por cliente y espacio de cobranza — 27/10/2026

Commit funcional: `107fa14d31f9f65322a81909842905cf08d7925a`.
Hallazgos: `REP-OPCLI-01` y `UX-COL-01` en `HARDENING.md`.

## Alcance

- Reportes → Operaciones por cliente (`/reports/client-operations`), también
  accesible desde Shipping Instructions. Selección por nombre, código o RTN;
  filtros de alcance y modalidad; PDF/Excel con todos los resultados filtrados.
- Criterio confirmado por el usuario: cotizaciones Ganadas pendientes de crear
  operación y embarques en curso. Excluye finalizados, cancelados y eliminados;
  una cotización de una operación cerrada no reaparece como pendiente.
- Detalle comercial: número de cotización/operación, origen, consignatario real,
  modalidad y estado. No exporta costos, márgenes, notas internas o proveedores.
  Lo aún no registrado se identifica como pendiente de confirmar.
- Cobranza y Estado de cuenta reciben selector de clientes buscable, jerarquía
  visual, indicadores, desglose de aplicaciones y remanente, historial y filtros.
  Mantiene registro/reverso de recibos, anticipos y cálculos de saldo existentes.

No hay migraciones, cambios a documentos existentes, nuevos permisos de escritura
ni habilitación de contabilidad automática. Las lecturas mantienen RLS vigente.
El nuevo reporte está disponible para Admin, Operaciones y Ventas, sujeto a los
datos que su sesión puede consultar.

## Validación local

- 467/467 pruebas Node, incluidas 17 nuevas de selector, cobranza y reporte.
- TypeScript y build Next.js aprobados (102 páginas).
- Lint: 475 archivos, 223 diagnósticos históricos, cero regresiones.
- Chrome con páginas/componentes reales y servicios locales ficticios: búsqueda
  por nombre/código/RTN, teclado, carga y errores, parcialidades, cambios de
  cliente/moneda, filtros, uso inline y móvil de 390 px.
- Once grupos de navegador aprobados, sin excepciones. Descargas reales PDF/Excel
  incluyen filas fuera de la página visible. PDF real de 501 filas conserva la
  última; PDF descargado de dos páginas inspeccionado visualmente.
- Revisión de los 18 archivos funcionales antes del push al repositorio público:
  solo código, pruebas ficticias y registro técnico. PDF, capturas, credenciales y
  artefactos locales quedan fuera del commit.

## Publicación

CI: [Quality 40599973352](https://github.com/dhernandezp123/sarierp/actions/runs/40599973352).
Aplicación y suites SQL/RLS existentes aprobadas desde el historial completo,
en una base desechable de GitHub. Sin cambios de SQL ni uso de la base de
Production durante esas pruebas.

Vercel Production funcional: `B3ZCEYwonjxPVdtYNQEq2yJvAkoy`, exitoso;
GitHub Deployment `7372671857`, asociado al SHA funcional exacto. Instancia:
`https://sarierp-aedvi6f54-claudherhn-5641s-projects.vercel.app`.
Build: `mcfM8c0kAmUmhZ204eZHm`.

Smoke sin sesión: 24 rutas/recursos aprobados, incluidas las rutas de Reportes,
reporte por cliente, Shipping Instructions y módulos financieros. Login, rechazo
de plataforma desde Sari, protección por sesión y recursos conservan el estado
esperado. Manifiesto idéntico en Forwarders, Sari e instancia inmutable.
Evidencia local en `.ua/intermediate/client-workspace-release-20261027/`.

## Aceptación operativa pendiente

1. Con una sesión real de Ventas/Operaciones/Admin, seleccionar un cliente con
   cargas FCL/LCL y consignatario distinto del cliente. Comparar origen,
   cotización y consignatario con sus expedientes.
2. Comprobar cotización Ganada sin operación, embarque activo y operación cerrada;
   verificar filtros y que PDF/Excel incluyan todo el resultado del cliente.
3. Con Contabilidad, buscar clientes en Cobranza/Estado de cuenta, revisar saldos,
   distribuir un pago y validar sus remanentes conforme al procedimiento habitual.
4. Confirmar el selector compartido en cotizaciones y formularios comerciales.

El smoke HTTP sin sesión y las pruebas con servicios ficticios no certifican UAT
autenticado ni la corrección de los datos operativos reales.
