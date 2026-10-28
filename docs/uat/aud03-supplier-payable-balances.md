# AUD-03 — Saldos comunes de cuentas por pagar

Estado: implementado y validado localmente; abierto para publicar SQL, verificar
RLS en el ambiente destino y completar UAT. No se ha hecho commit ni despliegue.

## Regla y alcance

`supplier_payable_balances` es una vista de solo lectura con `security_invoker`.
Respeta RLS de las tablas y exige tenant actual y rol Admin/Finanzas/Contabilidad
aprobado y activo. Los otros roles, perfiles inactivos/pendientes, plataforma sin
tenant y anon no obtienen información financiera.

Cada fila es una AP principal. Las NC/ND aparecen en su historial, sin sumar como
obligaciones independientes. La vista calcula, con aritmética NUMERIC del servidor:

- Obligación ajustada = base − NC activas + ND activas.
- Pagado = pagos Aplicado; los Reversado quedan excluidos.
- Saldo = obligación ajustada − pagado, conservando valores negativos.
- Estado derivado, días vencidos y pagos del mes según calendario de Honduras.
  Una deuda parcialmente pagada puede tener días vencidos aunque su estado siga
  siendo Parcialmente Pagada, igual que el core de AUD-02.

Detalle, bandeja, proveedor, reporte CxP y su tabla/CSV/PDF utilizan esta fuente.
El reporte Vencidas utiliza también sus saldos y días para la parte de CxP; la
parte de CxC conserva su fuente existente. El core privado de las operaciones
atómicas de AUD-02 consulta la misma vista. No hay recálculos de saldo a partir
de embeds de pagos limitados por la API.

Los agregados SQL incluyen todos los movimientos visibles antes de paginar las
obligaciones. El loader común lee las páginas hasta agotarlas con orden por ID,
tolera un límite de respuesta menor al solicitado y rechaza cargas parciales,
páginas repetidas o contexto obsoleto. La bandeja mantiene orden por vencimiento;
el proveedor, por fecha de creación. Los errores bloquean saldos/acciones y permiten
reintentar. Enlaces históricos a una nota dirigen a su cuenta principal.

Los KPIs Por pagar/Vencido suman saldos positivos de cuentas activas válidas.
Las anuladas se conservan en el listado Todos y reporte, fuera de esos totales.
Los sobrepagos se muestran con saldo negativo y total separado: no compensan
otras deudas. Una obligación negativa o movimientos de moneda/proveedor/monto
inconsistentes requieren conciliación; importes no comparables dicen
**Por conciliar**, sin inventar un cero. El proveedor tiene KPIs por cada moneda,
sin etiquetar una suma mixta con su moneda predeterminada.

La migración no modifica importes ni estados almacenados. La vista muestra el
estado derivado y conserva `stored_status` para diagnóstico. No concilia datos
históricos automáticamente ni cambia sus documentos. Las consultas de las
distintas pantallas no comparten una transacción: comparar tras actualizar todas
y sin escrituras simultáneas. El saldo es actual, sin reconstruir cierres pasados.

## Publicación pendiente

1. Revisar respaldos y migraciones pendientes por ambiente. Aplicar en orden
   AUD-01, AUD-02 y su forward-fix si aún faltan; luego
   `20261013140000_supplier_payable_balances.sql`.
2. Verificar permisos de la vista (solo SELECT de authenticated), atributo
   `security_invoker`, tenant/RLS y EXECUTE privado del core. No dar permisos
   amplios sobre tablas para resolver un fallo de integración.
3. Revisar anomalías con una sesión financiera válida **de cada tenant**:

   ```sql
   select id, moneda, stored_status, status, total_adjusted, paid_total,
     pending_balance, has_overpayment, has_negative_obligation,
     has_inconsistent_movements
   from public.supplier_payable_balances
   where needs_reconciliation
   order by id;
   ```

   Un contexto sin usuario/tenant no ofrece evidencia de que no existan anomalías.
   Resolver las inconsistencias mediante un procedimiento aprobado de Finanzas;
   conservar originales y auditoría. No borrar filas ni forzar saldos a cero.
   Revisar también pagos legacy asignados a notas y documentos sin una jerarquía
   válida. La vista no reasigna esos pagos ni convierte notas huérfanas en AP:

   ```sql
   select p.id, p.cuenta_pagar_id, a.tipo, a.parent_ap_id, p.monto, p.moneda
   from public.pagos_proveedor p join public.cuentas_pagar a on a.id=p.cuenta_pagar_id
   where p.status='Aplicado' and (a.tipo <> 'AP' or a.parent_ap_id is not null);

   select id, tipo, parent_ap_id from public.cuentas_pagar
   where (tipo in ('NC','ND') and parent_ap_id is null)
      or (tipo='AP' and parent_ap_id is not null);
   ```

   Si existen, resolverlos antes de aceptar los totales como conciliados. AUD-02
   bloquea nuevos pagos sobre notas; no se trasladan movimientos históricos.
4. Publicar frontend después del SQL. El nuevo código depende de la vista.
5. Ejecutar UAT autenticado en staging/datos ficticios autorizados; registrar
   ambiente, fecha, usuarios, resultados y evidencia. No ejecutar las suites de
   fixtures del repositorio en producción.

## Matriz UAT

Comparar mismo tenant, proveedor, moneda, rango de fechas y filtros de estado.
En reportes seleccionar Todos los períodos cuando se compare el conjunto completo
de la bandeja; su filtro inicial mensual tiene otro alcance.

| Caso | Resultado esperado |
| --- | --- |
| AP USD1000, NC200, sin pagos | Base1000, obligación800, pagado0, saldo800 en las cuatro vistas y exportaciones |
| AP USD1000, ND300, pago100 | Obligación1300, pagado100, saldo1200 en todas las vistas |
| NC/ND anuladas y pago reversado | Se conservan en historial; excluidos del saldo y pago mensual |
| NC que cubre AP completa | Saldo0, Pagada, sin sobrepago |
| AP100, pagos aplicados120 legacy | Saldo-20 y aviso/total de sobrepago20; no resta de otra deuda800 |
| AP anulada sin movimientos | Historial disponible, no suma a Por pagar ni Vencido |
| Legacy anulada con pagos/notas activos | Aviso de conciliación, no se reactiva ni cambia por consultar |
| Moneda/proveedor inconsistente o monto no finito | Por conciliar, sin importe combinado ficticio; operaciones inseguras rechazadas |
| NC excesiva legacy | Obligación negativa visible y aviso; no oculta el problema con clamp |
| Un proveedor con USD, HNL y EUR | Filas y totales separados por moneda; sin conversión implícita |
| Vence hoy; vencida parcial | Hoy no vencida; parcial anterior suma al KPI/reporte Vencidas por saldo actual |
| Más de1000 notas/pagos en una AP; respuesta limitada50 | Agregados completos, sin multiplicar pagos por notas ni perder movimientos |
| Más de1000 AP; segunda página falla | Carga completa con límite50; si falla, no se publica total parcial |
| Cambiar cuenta/sesión/tenant durante lectura | La respuesta anterior no publica saldos en el contexto nuevo |
| URL histórica de una NC/ND | Redirige a su AP principal; no permite pagar una nota como otra obligación |
| Dos tenants, todos los roles y perfiles no habilitados | Datos financieros solo para roles habilitados de su tenant |
| Registro/reintento/reverso/NC/ND tras el SQL | Conserva la atomicidad, idempotencia y control de saldo de AUD-02 |
| Móvil, teclado, CSV/PDF e impresión | Columnas y avisos legibles, monedas/formato correctos y mismos importes filtrados |

## Evidencia local

- Reproducción previa mediante las funciones reales de bandeja: NC200 sobre1000
  devolvía1000; ND300/pago100 devolvía900; sobrepago120/100 devolvía0.
- `supabase/tests/aud03_supplier_payable_balances.sql`: aprobada, con rollback,
  once perfiles ficticios y dos empresas. Incluye1005 notas y1005 pagos en una AP,
  notas anuladas, reversos, centavos, estados derivados, anomalías, roles y
  equivalencia con el core privado, sin reescribir estados históricos.
- `aud02_supplier_payments.sql` y
  `phase5_finance_catalog_tenant_isolation.sql`: aprobadas con rollback.
- `scripts/validate-aud02-concurrency.mjs`: cinco carreras reales aprobadas con
  el esquema AUD-03, incluida espera de lock observada en PostgreSQL.
- Nuevas pruebas Node de saldos/resúmenes/reportes y del componente de detalle;
  límite50 sobre1301 filas, recuperación de errores y enlaces históricos.
  Resultados finales de TypeScript, Node, ESLint y build en HARDENING.md.
- Stack aislado `sarierp_aud01`,110 migraciones, máxima `20261013140000`.
  No se migró ni reseteó el stack principal ni se consultaron datos productivos.
  Los fixtures de concurrencia con commit quedan solo en su volumen aislado.

Pendiente: RLS desplegado y revisión visual/UAT con usuarios autenticados. Las
pruebas de hooks/red simulados y SQL local no sustituyen esas comprobaciones.
AUD-04 conserva el alcance sobre facturación, histórico, Miami y otros módulos;
en este cambio se resuelve la completitud de las lecturas CxP afectadas.
