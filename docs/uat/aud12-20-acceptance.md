# Aceptación de AUD-12 a AUD-20

Preparado el 14/10/2026. El trabajo local no acredita despliegue, firma funcional
ni resultados de navegador. Ver [matriz de release](../release/audit-release-matrix.md)
y HARDENING.md para las validaciones efectivamente ejecutadas.

| ID | Verificación en destino | Pendiente fuera del código local |
| --- | --- | --- |
| AUD-12 | Asignar con cero, una y dos cuentas; excluir inactivas/pendientes/otro cliente; cada cuenta ve solo su aviso y reintento no duplica | Desplegar AUD-06 y UAT del portal. Los avisos internos no cambian el destinatario único de email_1 |
| AUD-13 | Primera ejecución de Quality, instalación limpia SQL y bloqueo de una infracción nueva sin aumentar baseline | Publicar workflow y configurar controles de merge por administrador |
| AUD-14 | Completar FCL, carga suelta y Miami con todos los pasos/roles de la matriz | Inventario remoto, responsables por nombre, evidencia y firmas reales |
| AUD-15 | Interceptar error de auditoría auxiliar, proveedor/cierre incierto y caída de entorno; referencia visible coincide con log seguro | Verificar captura/retención de logs del hosting y acceso de soporte |
| AUD-16 | Crear FCL/FTL, carga suelta y Miami; padre/hijos/cargos consistentes y error SQL sin creación parcial | UAT de creación y continuar descomposición por módulos cuando corresponda |
| AUD-17 | Editar, Cancelar, sidebar, breadcrumbs, atrás/adelante, cerrar, guardar fallido y guardar correcto; reemplazar factura manual conserva su diálogo | Navegadores reales soportados, móvil/teclado y comportamiento de historial |
| AUD-18 | Bloqueos de cliente/pricing/operación muestran responsable; Admin navega al flujo válido, Finanzas crea seguimiento personal sin enlace de edición ajeno | Acordar SLA/escalamiento y responsables reales; la tarea personal no asigna trabajo a otra persona |
| AUD-19 | Arranque con configuración local, tenant activo y usuario sintético aprobado; comprobar rutas y módulos opcionales desactivados | Ensayo por otro desarrollador en instalación nueva; no se crearon credenciales de negocio |
| AUD-20 | Capturar eventos con lead interceptado, medir pricing/booking/PDF frío y caliente con datos sintéticos | Línea base móvil, presupuestos y herramienta de analítica aprobada |

## Historial y cambios sin guardar

Los campos del área del guard generan dirty; controles ajenos a ese contenedor
y elementos con data-unsaved-ignore no lo generan. El editor manual aporta su
dirty explícito: buscar historial no marca cambios en el documento. Cancelar usa
requestFormNavigation y los guardados limpian el estado solo después del éxito.

El historial interno usa la [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event)
cuando existe y la navegación es cancelable/interceptable. Navegadores antiguos
o navegaciones no cancelables mantienen protección de enlaces/botones y cierre,
pero no se certifica el bloqueo de atrás/adelante en esos casos. No se parchea
el historial privado de Next ni se agregan entradas ficticias. Probar versiones
de navegador usadas por la empresa antes de cerrar AUD-17.

## Auditoría y soporte

La auditoría obligatoria de estados, dinero e incidencias permanece en sus RPC
atómicas. createActivityLog es auxiliar: devuelve resultado explícito, registra
solo identificadores/código y avisa si falla. No induce a repetir una operación
de negocio ya guardada. No permite reconstruir una traza obligatoria perdida.

Errores de API de correo y resultados inciertos llevan referencia en cuerpo,
mensaje y X-Request-ID, vinculada a un log JSON. Un fallo de ambiente anterior a
validar entidad puede tener tenant/entidad nulos; no se usan IDs no autorizados
del cuerpo. No registrar token, email, asunto, documentos ni excepción completa.

## Seguimiento operativo

Los responsables por área indican quién puede resolver el bloqueo, no una
asignación confirmada a un usuario. Programar seguimiento crea una tarea personal
en el módulo existente; permite fecha/prioridad y vuelve a Por facturar, donde
readiness se consulta de nuevo. No cambia el estado financiero del expediente.

Los umbrales existentes de aging siguen siendo señales. Acordar por servicio:
evento inicial, plazo de calendario, rol responsable, persona, escalamiento y
excepciones. No convertir 7/14 días en un SLA contractual por defecto.

Para medir Ganada→operación, espera de costos y cierre→factura usar timestamps
de los hitos y la misma moneda/expediente; anotar denominador, cancelaciones,
fechas ausentes y casos aún abiertos. Estos indicadores no están medidos ni
se presentan como resultados de esta corrección.
