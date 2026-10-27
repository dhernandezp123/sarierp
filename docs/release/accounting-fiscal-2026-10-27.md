# Facturación, Contabilidad y formatos Sari — publicación 27/10/2026

## Resultado

Se publicó el alcance autorizado de seis etapas, con las plantillas fiscales
conectadas a oficinas, descuentos, impuestos, proformas, cobranza y contabilidad.

- Commit funcional: `9394d9bd3083658a948fb911d3827af88159a36f`.
- GitHub: [commit publicado](https://github.com/dhernandezp123/sarierp/commit/9394d9bd3083658a948fb911d3827af88159a36f).
- Supabase Production: `fwspgdzvlbtbgiupvrzo`, ambiente verificado.
- Trece migraciones canónicas aplicadas desde `20261027100000_fiscal_offices.sql`
  hasta `20261027220000_positive_fiscal_total.sql`, antes de publicar el frontend.
- Vercel Production: `96BBSkByJyaybU8Fqz9BhgUztAb4`, estado exitoso.
- Instancia funcional:
  `https://sarierp-6yyq8abq4-claudherhn-5641s-projects.vercel.app`.
- Build funcional: `6ebUERu81fq5QgNYHY4iL`.

## Comportamiento publicado

- La oficina del cliente determina el emisor y autorización fiscal de la factura;
  NC/ND conservan la oficina y referencia fiscal de su factura original.
- Factura, NC/ND y Boleta usan Carta, logo/rojo Sari, teléfono/correo/domicilio del
  emisor, desglose fiscal, equivalencia antes del total, impresión y paginación.
  Las notas distinguen el CAI propio del número/CAI/fecha de la factura afectada.
- Descuento de importe por línea conectado a pantalla, cálculo, guardado, PDF y
  diario. Se aplica antes del ISV. Conserva el precio bruto y el neto. La conversión
  cambia precio y descuento una vez, manteniendo intacta la cotización original.
- Proforma a factura conserva descuentos, pagos y anticipos. Los excesos quedan
  como remanente disponible sin registrar caja por segunda vez.
- Cobranza permite aplicar un recibo a varias facturas/ND; estados de cuenta con
  movimientos, NC, anticipos, reversos y filtros de fechas/documentos/monedas.
- Catálogo de cuentas manual/CSV, asientos manuales/automáticos, períodos y
  reversos; compras por cuenta, boletas y retenciones con numeración independiente.
- Diario, mayor por cuenta, comprobación, balance, resultados, activos,
  depreciación mensual y bajas sin venta; PDF/Excel real en los reportes.

## Integridad y autorización verificadas

La aplicación SQL fue una única transacción con bloqueo, baseline de migraciones,
helper de tenant y ambiente verificados. Se registró el SQL exacto del commit en
`supabase_migrations.schema_migrations`; los hashes de las trece fuentes coinciden.
Las huellas de los valores previos de 26 tablas coincidieron antes/después,
excluyendo únicamente los campos agregados por estas migraciones. No se aplicó
ninguna otra migración pendiente.

Se verificó RLS de las tablas nuevas y que las políticas/ACL ajenas al cambio
permanecieran iguales. La creación directa de partidas o edición de líneas
fiscales desde cliente siguen bloqueadas. No se crearon asientos de apertura ni
se habilitó contabilización automática.

SQL de solo lectura con claims de un perfil Contabilidad aprobado pudo consultar
los nuevos módulos. El perfil de plataforma mantuvo contexto de empresa nulo y
cero clientes/oficinas/asientos visibles. Esta prueba valida autorización/RLS;
no es una sesión autenticada del navegador.

Los PDF originales recibidos y las muestras locales no forman parte del commit.
Se revisó el contenido publicado: solo código, migraciones, documentación y
pruebas ficticias; sin adjuntos, credenciales ni datos comerciales de esos PDF.

## Validación

- Local: 436/436 pruebas Node, TypeScript y build Next.js 16.2.6 correctos.
  Lint: 461 archivos, 223 diagnósticos históricos y cero regresiones.
- SQL/RLS: 24 suites en una copia desechable; descuentos desde cotización con
  operación finalizada y costos respaldados, conservación de moneda, proforma,
  pagos, NC/ND, compras, activos y restricciones entre empresas.
- Concurrencia aislada: un reintento genera un solo recibo; dos aplicaciones que
  superarían el saldo permiten una y rechazan la otra, con diario balanceado.
- Render PDF real: Carta con logo Sari, 1/7/40 líneas, referencias completas,
  descuentos, firma/huella y pie visible dentro de los límites de la página.
- [Quality CI 40575004853](https://github.com/dhernandezp123/sarierp/actions/runs/40575004853):
  trabajos `application` y `database` completados con éxito, incluida base
  desechable creada desde el historial completo.
- Smoke: 19 rutas/recursos, login, protección de módulos nuevos, API sin sesión,
  logo y rechazo de plataforma en dominio Sari. Mismo build/manifiesto en raíz,
  Sari e instancia inmutable de Vercel.
- Evidencia local en `.ua/intermediate/accounting-release-20261027/`.

## Configuración y aceptación pendientes

1. Completar dirección, teléfono, correo y códigos SAR de SPS/Tegucigalpa en
   Configuración de Empresa y asignar oficina a cada cliente.
2. Registrar las autorizaciones CAI reales por oficina/tipo con rango, vigencia y
   próximo correlativo verificado. No inferir el siguiente número desde un PDF
   histórico ni reciclar numeraciones.
3. Ingresar/importar el catálogo, asignar cuentas, abrir períodos y definir la
   fecha de inicio cuando Contabilidad esté lista. La automatización permanece
   apagada y no se importaron saldos ni movimientos de Zafra.
4. UAT con Contabilidad: emitir mixtas/exoneradas, convertir proforma pagada,
   aplicar recibos y NC/ND, conciliar estados de cuenta/mayor, registrar compra,
   retención y activo, y revisar sus PDF/Excel desde el navegador.
5. Contrastar el formato de Retención y clasificar Comprobante de Entrega cuando
   se proporcionen esos PDF. No se presume que Entrega sea Guía de Remisión.

Una reversión técnica del frontend debe conservar los documentos, numeración,
pagos y asientos ya registrados; no eliminar el historial fiscal/contable.
