# Gerencia: cortesias, avisos, actividad y gastos

Fecha: 05/11/2026. Solo Production. Demo queda fuera del alcance.

## Fase 2: cortesia por linea

En Facturacion > nuevo borrador, cada concepto permite solicitar cortesia con motivo. Gerencia revisa en `/invoicing/courtesies`. La designacion explicita o el master contable vigente se comprueban en SQL; no basta el rol Admin. Nadie aprueba su propia solicitud. Los revisores designados de otros roles acceden solo a la bandeja de revision, sin recibir permiso de emision.

La autorizacion esta ligada a revision, contenido, cliente/emisor y autoridad vigente. Guardar cambios invalida la decision; emitir sin cambios conserva la revision. El servidor excluye unicamente las lineas aprobadas, mantiene orden, cuenta contable, impuesto y origen de las restantes y deja intacta la cotizacion. La aplicacion y el correlativo fiscal son atomicos e idempotentes. No aplica a facturas ya emitidas ni reemplaza notas/correcciones fiscales. Se bloquea el descuento completo como sustituto de una cortesia.

La solicitud notifica inmediatamente a los revisores elegibles y la decision al solicitante. Una factura debe conservar al menos una linea facturable. Los importes de revision muestran cantidad, base neta, ISV y total en moneda de origen, antes de conversion.

Admin Pruebas y el master actual (Zonia) mantienen las fuentes de permiso de fase 1. Mauricio requiere crear su cuenta y una designacion expresa posterior; no se crean usuarios ni se asignan permisos por nombre.

## Fase 3: avisos internos

La bandeja `/alerts` incorpora alertas contables y seguimiento. El cierre operativo explicito existente (`Finalizado` y `closed_at`) alimenta la cola canonica de facturacion; no se introduce otro estado operativo paralelo. Todos los embarques activos deben estar cerrados, los costos validados y los datos/lineas ser facturables. Una factura activa resuelve el pendiente.

Contabilidad, Finanzas y Admin reciben avisos de facturacion/vencimientos. Operaciones recibe los de embarques de su asignacion canonica. Las consultas al abrir la bandeja usan condiciones actuales; la campana persistente se concilia mediante el scheduler.

Fechas DATE y dias de calendario en Honduras. Valores iniciales: 7/3/0 dias antes, nueva etapa cada 7 dias vencidos; saldo real de `customer_document_balances`, incluidas aplicaciones y notas. Un pago parcial actualiza el importe; liquidacion/anulacion resuelve el aviso. Se deduplica empresa, entidad, persona y etapa, incluyendo fecha de vencimiento.

## Fase 4: clientes y actividad

En `/accounting/alerts`, Admin/master configura intervalos, canales y seleccion de contactos registrados por cliente, con motivo, revision y auditoria. Email y portal desactivados inicialmente. La activacion es expresa por empresa: Sari tiene avisos internos habilitados con auditoria de despliegue; empresas sin configuracion permanecen apagadas. Los correos seleccionados se normalizan/deduplican; cambiar una direccion no transfiere su autorizacion al correo nuevo. Las cuentas de portal deben estar activas, aprobadas y vinculadas a ese cliente/empresa. No se crean ni invitan cuentas automaticamente.

El portal enlaza cada aviso a `/portal/facturas/[id]`, con saldo actual y fechas, sin costos/asientos. Una RPC valida cliente, empresa, rol, actividad y aprobacion. Fuentes liquidadas/anuladas no conservan recordatorios pendientes.

El transporte reutiliza `deliverEmail`: claim/lease atomico, solicitud congelada, idempotencia de proveedor y evidencia de aceptacion. El scheduler solo inicia filas `pending` con cero intentos; resultados rechazados/inciertos quedan para conciliacion, sin reenvio diario automatico. Auditoria de entregas en la configuracion. No se habilita un boton de reintento que pueda duplicar un correo sin conciliarlo.

`/clientes/activity`: ultima cotizacion, ultima operacion creada y ultimo movimiento efectivo, diferenciados. Movimiento: salida real de booking vigente o recepcion Miami; nunca ETA/ETD estimada. Editar el perfil no reinicia el contador. Ventas consulta solo cartera asignada; Admin/Contabilidad/Finanzas pueden consultar la empresa. Umbrales iniciales 30/60/90 dias; clientes sin historial usan registro inicial si existe, sin inventar una fecha base ausente.

### Scheduler y activacion de correo

- `vercel.json`: `0 12 * * *`, diario desde las 06:00 de Honduras. En Hobby, Vercel puede ejecutar durante la hora siguiente: [limites oficiales](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- `/api/cron/accounting-alerts`: `CRON_SECRET` privado de al menos 32 caracteres, comparacion constante, `VERCEL_ENV=production` y ambiente Production verificado en base. Excepcion de proxy limitada a esa ruta exacta, sin aceptar cabeceras de tenant del solicitante. La ruta valida su propia autenticacion antes de acceder a datos.
- Configurar secreto exclusivamente en Vercel Production. Demo no recibe variables, migraciones ni despliegue.
- Correo requiere simultaneamente `ACCOUNTING_ALERTS_EMAIL_ENABLED=true`, `OUTBOUND_EMAIL_ENABLED=true`, transporte Resend, canal de empresa habilitado y contacto seleccionado vigente. Mantener `ACCOUNTING_ALERTS_EMAIL_ENABLED=false` hasta prueba controlada con destinatario autorizado, saldo, marca y evidencia de entrega.
- Lote inicial conservador: hasta 20 primeros intentos por ejecucion, cuatro concurrentes. El volumen y limite del proveedor deben validarse antes de activar; ampliar capacidad/scheduler si la cola excede ese volumen. Un pendiente cuya etapa/destinatario/documento pierde vigencia se cancela antes de enviar.
- Conciliacion: revisar estado y evidencia del proveedor para resultados inciertos; no cambiar directamente a pendiente ni reenviar sin confirmar si hubo aceptacion. No se realizaron envios reales durante desarrollo.

## Fase 5: gastos mensuales

`/accounting/expenses`, accesible desde Contabilidad: ranking por cuenta o proveedor, mes seleccionado contra anterior, variacion, exportacion PDF/Excel/CSV y detalle de partidas con apertura del asiento. Usa importes contabilizados en HNL, netos debe menos haber, incluyendo abonos/reversos. Separa Gasto y Costo; no clasifica todo debito bancario como gasto.

Compras se vincula mediante `journal_entries.source_id -> cuentas_pagar -> purchase_documents.supplier_snapshot`, con proveedor historico y fallback al proveedor registrado. Los reversos conservan el proveedor del asiento original. Lecturas paginadas completas; un fallo de fuente no produce un reporte parcial.

Adquisiciones del registro de activos se muestran por separado por fecha/costo de registro, identificando las que carecen de partida vinculada. No se presentan todos los movimientos de Activo como inversion ni ese registro como conciliacion del total de inversiones.

## Estado de validacion

Regresiones de cortesias, emision fiscal, cuentas contables, saldos, RLS y avisos ejecutadas localmente con datos ficticios y rollback. Suite completa SQL/RLS: 43 archivos aprobados sobre historial reconstruido. Pruebas Node 620/620, TypeScript, ESLint y build/postbuild OCR aprobados. Chrome con las seis paginas reales y datos ficticios: 20 comprobaciones, 1280/768/390 sin overflow/excepciones; aprobacion/error/reintento, modal contable y exportacion CSV. Fuente sans-serif de respaldo en el fixture; scripts de antivirus inyectados bloqueados en la instancia de prueba, sin llamadas de aplicacion a servicios reales. Las pruebas simuladas no certifican UAT autenticada ni entrega de correo real.

Migraciones `20261104160000`, `20261105120000` y `20261105130000` aplicadas y registradas exclusivamente en Production. RLS, aprobadores Admin/Zonia y huellas de diez tablas de negocio verificadas; activacion solo de Sari, sin clientes. Pendientes antes de declarar cierre operativo: publicar interfaz, verificar CI y smoke, UAT con Gerencia/Zonia/Operaciones y prueba controlada de entrega antes de activar clientes. Los correos reales permanecen desactivados.

## Prueba de branding autorizada (05/11/2026)

Gerencia autoriza una prueba al correo principal registrado de Inversiones Dennis. La plantilla compartida incorpora logo, colores, nombre comercial/legal y contacto del tenant; imagen HTTPS publica, remitente comercial sobre la direccion autorizada, texto alternativo y HTML escapado. La prueba se identifica como SIN COBRO REAL, con importes ficticios y sin crear documentos fiscales o cuentas de portal.

La migracion `20261105140000` agrega una auditoria separada de pruebas, excluida del scheduler. La ruta de operador requiere secreto, Production verificado, tenant del proxy, cliente/correo registrados y motivo. Un rechazo explicito puede reintentarse con confirmacion de no aceptacion y CAS; estados inciertos requieren conciliacion. La consulta GET del proveedor verifica destinatario y marca sin reenviar. Correos automaticos y contactos permanecen sin activar.

El primer intento local fue rechazado por credencial Resend invalida, sin aceptacion. La prueba con transporte Production conserva el identificador original para evitar duplicados. Aceptacion y entrega se distinguen; evidencia operacional por request_id y recibo de proveedor, sin registrar secretos.