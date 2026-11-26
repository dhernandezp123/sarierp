# Gerencia: fase 1 - reglas y permisos

Fecha: 04/11/2026. Alcance: preparacion de permisos y reglas; no habilita todavia solicitudes de cortesia ni envios automaticos. Solo Production; Demo permanece sin actualizar.

## Aprobadores de cortesias

| Persona | Fuente del permiso | Condicion |
| --- | --- | --- |
| Admin Pruebas | Designacion explicita | Usuario interno activo, aprobado y de Sari |
| Zonia Flores | Master de Contabilidad designado actualmente | Conserva acceso mientras mantenga esa designacion, rol elegible, estado aprobado y cuenta activa |
| Mauricio Rivera | Pendiente | No existe su cuenta; incorporarlo expresamente por ID cuando se cree. No se asignan permisos por coincidencia de nombre |

Los demas Admin no adquieren automaticamente capacidad de revisar cortesias. Administracion puede gestionar designaciones con confirmacion y motivo. El master de Contabilidad puede consultar autorizadores, pero su permiso master no habilita modificar la lista de designaciones.

Se crean un registro de designaciones y un historial de cambios, con aislamiento de empresa y sin escrituras directas desde el navegador. `can_approve_invoice_courtesy()` sera la comprobacion del servidor para la fase 2; no utilizar `is_invoice_master()` como sustituto porque incluye a todos los Admin de la empresa.

## Regla de cortesia para fase 2

- Solicitud por cada linea de un borrador: motivo, concepto, importe, moneda y origen. No es un permiso para borrar conceptos libremente.
- Aprobacion/rechazo individual de un autorizador vigente y registrado. Guardar solicitante, revisor, fechas y resultado; impedir autoaprobacion de la misma solicitud.
- Vincular autorizacion a revision del borrador y huella del concepto/cotizacion. Cambiar importe, moneda, impuesto, origen o contenido relevante invalida la decision anterior.
- Comprobar autorizacion efectiva y aprobacion al emitir, dentro de la transaccion. Revocar permisos no debe dejar autorizaciones pendientes utilizables sin nueva revision.
- Controlar omision de linea y descuento completo; no permitir eludir la aprobacion aplicando descuento del 100 %.
- Conservar cotizacion y registros originales, costos y auditoria. Una factura emitida no se modifica mediante esta accion; un ajuste posterior se trata en su flujo documental autorizado.
- Mantener validaciones fiscales, saldo y correlativos existentes. Pedir o rechazar una cortesia no emite documentos ni consume numeracion.

## Listo para facturar: regla para fase 3

- Operaciones confirma expresamente el estado de listo para facturar de la operacion/embarque; no inferirlo solamente de ETA, arribo o cotizacion Ganada.
- Comprobar empresa, operacion vigente, cotizacion/origen correspondiente y validacion financiera requerida por el flujo actual.
- No generar un pendiente si ya existe una factura activa equivalente. Un borrador/proforma no se toma automaticamente como factura emitida.
- Si se retira la confirmacion, cambia una condicion requerida o se emite la factura, resolver la alerta.
- Destinatarios internos: usuarios activos y aprobados de Contabilidad/Finanzas y responsable operativo segun asignacion canonica. El enlace mantiene los permisos normales del documento.

## Vencimientos: calendario para fases 3 y 4

- Etapas iniciales: 7 y 3 dias antes, dia del vencimiento, y seguimiento cada 7 dias mientras exista saldo vencido. Etapas configurables por empresa en su implementacion.
- Fechas de calendario de Honduras; las fechas DATE del documento no deben desplazarse por conversiones UTC.
- Usar saldo pendiente real del origen canonico de cuentas por cobrar. Revalidar documento, vencimiento y saldo antes de crear o entregar cada aviso.
- Resolver o cancelar avisos al liquidar saldo, anular el documento o cambiar las condiciones. Un pago parcial actualiza el saldo comunicado.
- Deduplicar por empresa, factura, destinatario y etapa/fecha. Los reintentos de correo deben conservar auditoria e idempotencia.
- Cliente: contactos registrados en el perfil, con seleccion explicita para cobro al habilitar la fase 4, sin duplicar direcciones. Aviso de sistema a usuarios activos del portal vinculados al mismo cliente/empresa. Tener correo no crea una cuenta de portal.
- Interno: Contabilidad/Finanzas y Operaciones responsable. No habilitar correos reales en Demo.
- Un scheduler de servidor procesara avisos aunque nadie visite el sistema. No programado ni activado en esta fase.

## Actividad y gastos: reglas posteriores

- Inactividad comercial: umbrales iniciales configurables de 30/60/90 dias, diferenciando ultima cotizacion, operacion registrada y embarque efectivo. Nunca usar ediciones generales del perfil para reiniciar el contador. Avisos solo internos.
- Gastos mensuales: reutilizar estado de resultados en HNL y partidas contabilizadas, ranking por cuenta, comparacion mensual y detalle. Separar costos, gastos y adquisiciones clasificadas como activos; no equiparar cualquier salida bancaria a gasto.

## Validacion y salida de fase 1

Se requiere probar autorizacion explicita, master actual, revocacion, inactividad, usuario pendiente/cliente/otra empresa, RLS, historial inmutable, duplicados y controles de UI. Aplicar exclusivamente la migracion de esta fase y verificar en Production los dos autorizadores efectivos. La gestion de autorizadores se incorpora en Contabilidad > Configuracion contable.

Las solicitudes/aprobaciones de cortesias, el cierre del descuento total y los avisos efectivos requieren sus fases siguientes. Esta fase no declara esos flujos terminados.
