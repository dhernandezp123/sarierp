# Validación operativa: cartera, Caja/Bancos y conciliación

Plan: [seis etapas aprobadas](../plans/contabilidad-caja-bancos-20261028.md).
Implementación: 28/10/2026. Este documento no certifica publicación ni aceptación.

## Evidencia local del 28/10/2026

| Comprobación | Rama principal | Prueba |
| --- | --- | --- |
| Pruebas Node | 491 aprobadas | 497 aprobadas con APP_ENV demo |
| SQL/RLS | 27 suites aprobadas | 3 suites aprobadas con JWT temporal |
| TypeScript / lint / build | Aprobados | Aprobados |
| Regresiones lint | 0 (223 diagnósticos históricos) | 0 (misma base histórica) |
| Código compartido | 533 archivos; 26 variantes revisadas, sin diferencias inesperadas | Mismo resultado |

Las pruebas SQL se realizaron en bases locales desechables y se revirtieron.
Se verificó que sus tablas nuevas no persistieran después del rollback. El
contenedor desechable volvió a quedar detenido; el stack normal no se modificó.
La compilación de Prueba utilizó claves ficticias inutilizables, con URL/dominio
Demo y sus guardas vigentes; no demuestra sesión autenticada ni publicación.

Navegador sobre compilación local estable: siete comprobaciones aprobadas en
1500×1000 y 390×844, búsqueda por teclado sin consultas por carácter, pagadas,
antigüedad, filtro NC/saldo completo, pantallas móviles y descargas PDF/XLSX.
Cero errores de navegador. Renderizado real del PDF conserva fila 505, columnas
dentro de página y firmas en la última; XLSX probado con 650 filas, una hoja,
subtotales por cliente/moneda, números, autofiltro y títulos de impresión.
La plantilla bancaria original solo se usa como referencia; no se importaron
sus cuentas, nombres de personas o saldos reales.

Estos controles no reemplazan los casos de aceptación de abajo. Continúan
pendientes el commit, las migraciones remotas, la publicación y el UAT real.

## Antes de usar datos reales

1. Revisar el catálogo de cuentas (manual o CSV), cuentas bancarias/cajas y sus
   monedas. Cada cuenta bancaria tiene una cuenta contable de Activo propia.
2. Acordar con Contabilidad la fecha, saldo y contrapartida de apertura. No hay
   fecha inicial ni saldos predeterminados. Una apertura ya contabilizada no se
   ingresa otra vez; el sistema bloquea vincular una cuenta contable con historial.
3. Crear los períodos contables necesarios. La configuración de contabilización
   automática conserva su valor actual; guardar una cuenta no la activa.
4. Registrar cheques/depósitos anteriores a la apertura como partidas iniciales
   en circulación, conservando referencias. No crean otro movimiento de efectivo.
5. Revisar la cobertura histórica: los datos existentes al aplicar la migración
   forman una apertura reconstruida. No se ofrece un cierre anterior verificable
   a esa cobertura cuando ya había registros financieros.

## Casos de aceptación en Prueba

Usar únicamente empresas, cuentas, clientes y documentos ficticios.

| Caso | Resultado esperado |
| --- | --- |
| Factura no vencida, aunque sea de un mes anterior | Saldo Actual |
| Vencimiento hoy/ayer y límites 30/31/60/61/90/91 | Tramo exacto desde vencimiento, sin superposición |
| Pago parcial, liquidación por NC, ND con pago dirigido | Total − NC − pagado − retención = por pagar; ND una sola vez |
| Factura pagada | Visible al escoger Pagados |
| Corte anterior a pago/reverso/aplicación de anticipo | Conserva saldo del corte anterior |
| Estado consolidado con filtro NC/ND | Filtra detalle y conserva apertura/saldo completo |
| Anticipo sin aplicar | Incluido una vez en estado consolidado; no liquida documentos |
| Listado general y Excel por cliente | Una hoja, bloques/subtotales por identidad y moneda, gran total por moneda |
| Estado proveedor y retención | Reduce deuda; retención no sale del banco |
| Recibo a varias facturas y anticipo aplicado después | Una sola entrada de efectivo |
| Transferencia propia HNL/USD | Dos piernas, un asiento; fuera del flujo externo |
| TC compra/venta nueva | No recalcula cobros, facturas ni cotizaciones anteriores |
| Contabilidad apagada | Movimiento operativo visible y marcado sin asiento; contabilización explícita |
| Cobro recibido y reversado antes de contabilizar | Original y reverso se contabilizan juntos, efectivo neto cero |
| Período cerrado o error de asiento | Rechazo completo; no queda medio reverso ni media transferencia |
| Extracto repetido o solapado | Reintento idempotente; coincidencias requieren revisión/motivo registrado |
| Parcial/grupo de movimientos vinculados | No supera restantes y no crea otro asiento |
| Cheque pendiente y depósito en tránsito | Banco − cheques + depósitos − otras salidas = banco conciliado |
| Deshacer vínculo | Conserva historial y versiones anteriores |
| PDF/Excel/CSV de conciliación | Cuenta, moneda, TC, libros, pendientes, diferencia y nombres/firmas |
| Otra empresa/Ventas/perfil inactivo | Sin datos ni acciones bancarias |

Verificar PDF con varias páginas y todos los registros, abrir el XLSX en Excel,
comprobar importes numéricos/subtotales y probar escritorio/móvil con teclado.
La emulación de navegador no acredita un dispositivo físico ni sesión real.

## Publicación coordinada

- Migraciones canónicas nuevas: `20261028120000`, `20261028130000`,
  `20261028140000`, antes de cada frontend. No se modifica SQL ya aplicado.
- Mantener las ramas `main` y `demo` con variantes de sandbox revisadas. El
  comparador acepta `WORKTREE` para revisar cambios locales sin hacer commit.
- Conservar acceso temporal/JWT de Demo, bloqueo de correo/Storage y marca de
  prueba en cada página. No transferir secretos, cuentas bancarias ni saldos reales.
- Verificar SQL/RLS y versión publicada por ambiente, después una sesión real de
  Contabilidad. Un build o HTTP sin sesión no acredita el flujo autenticado.
- Commit, aplicación remota, publicación y aceptación siguen pendientes hasta
  que se registren sus evidencias. No hay aprobación electrónica de conciliación:
  los nombres son los que se imprimirán para firma externa.
