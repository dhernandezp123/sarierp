# AUD-02 — Pagos y ajustes a proveedores

Estado: implementado y probado localmente; abierto para publicación, RLS remoto
y UAT autenticado. No se ha publicado SQL ni frontend, ni se ha hecho commit.

## Comportamiento y límites

- Admin, Finanzas y Contabilidad, aprobados y activos en su tenant, registran
  pagos y NC/ND, reversan pagos y anulan documentos mediante cuatro RPC.
- Las operaciones bloquean primero la AP principal. Movimiento, saldo/estado y
  auditoría se confirman en una transacción. No se pagan notas individuales.
- Obligación = base − NC activas + ND activas. Pagado = pagos `Aplicado`.
  Pagos y NC no pueden superar el saldo actualizado; una ND no puede anularse
  si deja pagos por encima de la obligación. Las RPC validan moneda, monto
  positivo con dos decimales, método y fechas no futuras (calendario Honduras).
- Pagos/ajustes tienen clave UUID y payload. Una clave repetida confirma el mismo
  movimiento; con otros datos se rechaza. Reintentar un pago ya reversado no lo
  aplica nuevamente. Una clave nueva representa una operación nueva: no se
  deduplican documentos bancarios distintos por coincidencia de monto/referencia.
- El navegador conserva solo la clave por tenant/usuario/cuenta/acción en
  `sessionStorage`, hasta confirmación de RPC o lectura del comprobante con
  esa clave. Ante respuesta incierta, actualizar historial antes de crear un
  registro nuevo. Sin almacenamiento disponible, los reintentos de la sesión
  mantienen clave en memoria; una recarga completa requiere conciliar historial.
- Reversos y anulaciones requieren motivo, fecha y responsable. El original se
  conserva; no se borran pagos/notas/cuentas con historial ni cuentas anuladas
  sin movimientos. Una AP con pagos aplicados o notas activas requiere reversar
  y anular esos movimientos antes de anularse. El reverso permite corregir pagos
  legacy sobre cuentas ya anuladas, conservando su estado Anulada.
- RLS cierra INSERT/UPDATE/DELETE directos de pagos para `authenticated`.
  Triggers impiden manipular estados y notas fuera de RPC, cambiar originales
  con historial o borrar documentos auditados. Los cores no tienen EXECUTE
  público, anon, authenticated ni service_role. Service/owner sigue siendo un
  actor privilegiado para altas/importaciones; no exponer sus credenciales.
- Alta de AP y actualización de adjuntos siguen disponibles. La generación
  idempotente de CxP desde flete conserva su RPC y su tenant.
- Lecturas de pagos/ajustes en detalle son completas, con errores recuperables;
  un fallo de lectura bloquea acciones y no muestra un saldo ficticio. Solicitudes
  obsoletas no aplican datos al cambiar de cuenta/sesión.
- Bandeja, proveedor y reportes excluyen reversos. La conciliación general de
  NC/ND y la completitud de esas otras vistas permanecen en AUD-03/AUD-04.
  El reporte de pagos muestra movimientos actualmente aplicados; no reconstruye
  un estado contable histórico anterior a un reverso posterior.

## Publicación pendiente

1. Respaldar y revisar datos reales. No ejecutar fixtures de `supabase/tests`
   contra producción. Inspeccionar los movimientos legacy de moneda/proveedor
   inconsistente, montos no finitos, ajustes excesivos, sobrepagos y estados
   discrepantes. La migración no corrige ni recalcula esas cuentas automáticamente.
2. Coordinar ventana de mantenimiento sin escrituras desde frontend antiguo.
   Sus INSERT/UPDATE de pagos quedarán bloqueados al aplicar SQL.
3. Aplicar en orden el historial pendiente, incluida AUD-01 si no está instalada:
   `20261013120000`, `20261013130000_atomic_supplier_payments.sql` y
   `20261013131000_supplier_cancelled_document_guard.sql`. La última es un
   forward-fix separado tras aplicar la migración atómica en validación local.
4. Verificar esquema/RLS y EXECUTE de las cuatro RPC con perfiles de prueba
   autorizados del ambiente pertinente. Publicar frontend después del SQL.
5. Ejecutar UAT de abajo en staging o datos ficticios autorizados. Registrar
   ambiente, fecha, actor, evidencia e incidencias antes de cerrar AUD-02.
6. Ante problemas, suspender escrituras y preparar forward-fix; conservar
   guardas e historial, sin restaurar escritura libre ni borrar movimientos.

Consulta de conciliación previa, solo lectura, sobre el esquema anterior o nuevo:

```sql
with notes as (
  select parent_ap_id, sum(case when tipo='NC' then -monto else monto end) adjustment
  from public.cuentas_pagar where tipo in ('NC','ND') and status <> 'Anulada'
  group by parent_ap_id
), payments as (
  -- Antes de AUD-02 todos los pagos son aplicados.
  -- Después añadir: where status='Aplicado'.
  select cuenta_pagar_id, sum(monto) paid from public.pagos_proveedor
  group by cuenta_pagar_id
)
select a.id, a.tenant_id, a.status, a.monto + coalesce(n.adjustment,0) obligation,
  coalesce(p.paid,0) paid,
  a.monto + coalesce(n.adjustment,0) - coalesce(p.paid,0) pending
from public.cuentas_pagar a
left join notes n on n.parent_ap_id=a.id
left join payments p on p.cuenta_pagar_id=a.id
where a.tipo='AP' and a.parent_ap_id is null
  and (a.monto + coalesce(n.adjustment,0) < coalesce(p.paid,0)
    or a.monto + coalesce(n.adjustment,0) < 0
    or (a.status='Anulada' and coalesce(p.paid,0)>0));

select p.id, p.cuenta_pagar_id from public.pagos_proveedor p
join public.cuentas_pagar a on a.id=p.cuenta_pagar_id
where p.moneda is distinct from a.moneda or p.tenant_id is distinct from a.tenant_id
  or p.monto::text in ('NaN','Infinity','-Infinity');

select n.id, n.parent_ap_id from public.cuentas_pagar n
left join public.cuentas_pagar a on a.id=n.parent_ap_id
where n.tipo in ('NC','ND') and (a.id is null or a.tipo <> 'AP'
  or n.proveedor_id is distinct from a.proveedor_id or n.moneda is distinct from a.moneda
  or n.tenant_id is distinct from a.tenant_id or n.monto::text in ('NaN','Infinity','-Infinity'));
```

## Matriz UAT

| Caso | Resultado esperado |
| --- | --- |
| AP USD100: pago40, NC20, ND10, pago50 | Obligación90, pagado90, pendiente0, Pagada; movimientos y auditoría juntos |
| Dos usuarios: pago60 y pago60 sobre AP100 | Segundo espera; uno aplicado60, otro rechazado; pendiente40 |
| Misma clave de pago en dos conexiones | Mismo ID, un solo movimiento y una auditoría de alta |
| Pago60 y NC60 simultáneos; luego orden inverso | Segundo rechazado sobre el saldo actualizado |
| Respuesta perdida, doble clic y reintento | Clave conservada; no duplica el pago ni el ajuste |
| Respuesta perdida y recarga/actualizar historial | Se recupera el registro por clave antes de habilitar otra solicitud |
| Error al cargar pagos o segunda página | Acciones bloqueadas; Reintentar recupera el historial completo |
| Cambiar cuenta/sesión durante un guardado | Respuesta antigua no carga datos ni formulario en la nueva cuenta |
| Reversar pago50 con motivo | Original50 conservado, Reversado, saldo reabierto, fecha/actor/motivo registrados |
| Repetir reverso o reintentar clave ya reversada | No reaplica ni duplica; no cambia motivo original |
| Anular ND con pagos por encima de la nueva obligación | Rechazo y rollback de estado/metadatos |
| Anular AP con pago o nota activa | Rechazo; reversar pagos y anular notas primero |
| Anular AP sin movimientos; editar monto/borrar después | Anulación con motivo, posterior edición/borrado rechazados |
| Finanzas/Contabilidad/Admin de dos empresas | Cada uno opera solo su tenant; no mezcla proveedores ni monedas |
| Ventas/Pricing/Operaciones/Cliente; inactivo/pendiente/plataforma sin tenant; anon | RPC y escrituras financieras denegadas |
| API directa INSERT/UPDATE/DELETE de pago y alta/estado de nota | No elude las RPC; lectura financiera autorizada conservada |
| Alta AP, adjuntar factura, generación desde flete repetida | Flujos existentes conservados, CxP de flete única |
| Reverso en bandeja/proveedor/reportes | No suma a pagado ni reporte de pagos activos; NC/ND generales pendientes AUD-03 |
| Motivo vacío, fecha futura, moneda distinta, monto inválido/excesivo | Rechazo sin movimiento ni cambio de estado |
| Móvil y teclado | Dialog con foco, Escape/Cancelar, motivo visible y bloqueos durante guardado |

## Evidencia local

- Stack `sarierp_aud01` aislado, 109 migraciones, seed deshabilitado; no se
  migró/reseteó el stack principal ni se enviaron correos o pagos externos.
- `aud02_supplier_payments_before.sql`: reprodujo sobrepago120/100 y anulación
  sin motivo antes del fix, con rollback.
- `aud02_supplier_payments.sql`: matriz real de permisos/RLS, tipos/monedas,
  reintentos, reversos y rollback de altas, anulaciones y reversos por fallo de
  auditoría; aprobado con rollback.
- `node scripts/validate-aud02-concurrency.mjs`: cinco carreras con espera real
  de lock comprobada en `pg_stat_activity`; aprobado. Solo admite el contenedor
  aislado; fixtures ficticios con commit quedan en su volumen para inspección.
- `phase5_finance_catalog_tenant_isolation.sql`: aprobado, incluida generación
  idempotente de CxP y cobros de facturas de otro tenant.
- La suite histórica `phase4_payment_atomic.sql` falla antes de ejercer sus
  cobros: su fixture de cliente no informa tenant en el esquema actual. No se
  utiliza ese fallo como evidencia contra AUD-02 ni se afirma que esa suite pasó.
- Siete pruebas Node nuevas: filtro de reversos, claves de solicitud y flujo
  real de página con red/hooks simulados. No sustituyen navegador ni UAT.
- TypeScript, suite Node completa, ESLint afectado y build: resultados en
  HARDENING.md. La inspección visual de este cambio en navegador está pendiente.
