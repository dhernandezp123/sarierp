# Revisión de privacidad y términos — 07/09/2026

Estado inicial: revisión documental y contraste con código completados; cobertura
jurídica no confirmada. El diagnóstico siguiente conserva la situación revisada.
Ver la actualización al final para los cambios locales autorizados posteriormente.

## Alcance y conclusión

Se revisaron `/politicas`, `/portal/info/terminos`, el formulario de demo, los
registros ERP/portal, branding, acceso público y proveedores visibles en código.
Por indicación del titular, esta revisión no audita RLS. No se verificaron el sitio
desplegado, contratos firmados, identidad jurídica, buzón, regiones, configuración
de proveedores ni procesos internos de atención y borrado.

La política del ERP cubre temáticamente propiedad de datos, confidencialidad,
seguridad, proveedores, cookies, retención, salida, disponibilidad, propiedad
intelectual, responsabilidad, documentos fiscales/logísticos y Trial. Eso es una
base útil, pero varios compromisos dependen de contratos y procesos no acreditados.
Los términos del portal requieren una revisión más profunda. Los pendientes
LEG-001 a LEG-004 de HARDENING.md siguen sin evidencia suficiente para cerrarse.

## Hallazgos y propuestas

| ID / prioridad | Evidencia | Cambio propuesto y condición de cierre |
| --- | --- | --- |
| POL-01 / Alta | `src/app/politicas/page.tsx` identifica DHer; `src/lib/platform-branding.ts` atribuye el producto a Hernova Systems. La identidad legal se difiere al contrato. | Confirmar denominación legal, RTN/ID, domicilio y relación entre marcas; identificar por separado al proveedor del software y al operador logístico. No sustituir nombres comerciales suponiendo equivalencia jurídica. Confirmar dominio y buzón: el texto usa forwarderserp.com y el correo contacto@forwarders.app. |
| POL-02 / Alta | La sección de contacto remite a plazo razonable/SLA, pero el CTA de `/politicas` promete máximo de tres días hábiles. | Unificar el CTA con el SLA real; retirar la promesa fija si no hay compromiso y capacidad aprobados. |
| POL-03 / Alta | El aviso se centra en datos cargados por organizaciones; la landing inserta nombre, empresa, email y teléfono opcional en `leads` directamente. | Añadir alcance para visitantes y solicitudes comerciales, identificar a quien decide ese tratamiento, finalidad de responder/coordinar demo, destinatarios, canal de derechos y criterio de conservación. Separar cualquier marketing futuro de la solicitud de demo; no imponer consentimiento publicitario para responder. |
| POL-04 / Alta | El portal dice que no comparte datos sin consentimiento salvo ley. El sistema usa Supabase y tiene integraciones de correo Resend. `/politicas` menciona Supabase/Vercel y categorías genéricas. | Evitar la promesa absoluta del portal. Explicar proveedores y destinatarios logísticos necesarios, sus funciones y la base aplicable. Mantener inventario de subprocesadores, regiones y acuerdos; confirmar cuáles están activos. La integración de Resend está comprobada en código, no su activación en producción. |
| POL-05 / Alta | `/register` y `/portal/register` no presentan aceptación ni registro de versión. Los términos del portal requieren sesión por `src/proxy.ts` y `src/app/portal/layout.tsx`. | Dar acceso público al texto logístico antes del alta mediante una ruta pública específica. Registrar documento, versión o hash, usuario/organización, fecha del servidor y acto de aceptación cuando corresponda. No basta una casilla visual ni metadata editable por el usuario. No abrir todas las rutas del portal. |
| POL-06 / Alta | Portal: precios sin previo aviso, 30 días gratuitos, disposición del paquete a los 90 días y responsabilidad limitada a valor declarado o una tarifa mínima interna no definida. | Confirmar condiciones reales y revisar validez con abogado. Definir tarifa aplicable y vigencia, notificaciones y procedimiento para carga no reclamada, reclamaciones, documentación, límites y seguro según contrato/modalidad. No inventar importes ni reemplazar por otra exención genérica. |
| POL-07 / Alta | Retención, exportación, eliminación, SLA y responsabilidad económica se remiten a instrumentos no aportados. | Preparar anexos reales: conservación por categoría, excepciones fiscales/litigios, rotación de copias, exportación, eliminación, incidentes, restauración y salida. Asignar responsables y ensayar solicitudes. Una cláusula no acredita que el proceso exista. |
| POL-08 / Media | ERP indica versión 1.0 del 22/06/2026; portal solo junio de 2026 y cambios inmediatos por uso continuado. | Conservar cada versión, fecha real de vigencia, comunicación de cambios y aceptación cuando proceda. Diferenciar aceptación contractual de aviso de privacidad. No fechar retroactivamente una nueva redacción. |

## Redacciones concretas propuestas

Son borradores que requieren validar identidad, operaciones y contratos antes de
publicarse. No modifican los textos vigentes.

**CTA de contacto del ERP, en lugar de la promesa de tres días:**

> Atenderemos tu consulta conforme a su naturaleza, la normativa aplicable y los
> plazos de soporte acordados.

**Nuevo apartado sobre solicitudes de demo, una vez identificado el responsable:**

> Cuando solicitas una demostración, tratamos tu nombre, empresa, correo y, si lo
> facilitas, teléfono para responder y coordinar la solicitud. El envío no implica
> contratar el servicio ni suscribirte a publicidad. Puedes contactar al responsable
> mediante el canal de privacidad indicado en este aviso.

Completar ese apartado con identidad, criterio/plazo real de conservación y
destinatarios confirmados; no publicarlo como aviso completo por sí solo.

**Sustitución propuesta para la afirmación absoluta del portal:**

> Para prestar el servicio, los datos necesarios pueden ser tratados por
> proveedores tecnológicos y comunicados a los participantes de la operación
> logística que correspondan, conforme a la finalidad informada y a la base
> jurídica aplicable. El aviso de privacidad identifica al responsable, las
> categorías de destinatarios y el canal para ejercer tus derechos.

Primero elaborar y enlazar ese aviso del operador logístico; el aviso del proveedor
del software no sustituye automáticamente al de Sari Express.

## Cookies y derechos

No se identificaron integraciones publicitarias o analítica no esencial en las
fuentes revisadas. Sí hay sesión Supabase y almacenamiento de preferencias/estado
de interfaz. Esto no certifica lo que el hosting o scripts externos puedan añadir.
Proponer un inventario de nombre, finalidad, duración y proveedor; decidir los
controles de consentimiento según tecnologías y jurisdicciones efectivamente
aplicables. No añadir un banner vacío como supuesto certificado de cumplimiento.

Las solicitudes de derechos necesitan un canal atendido, verificación proporcional
de identidad, responsable de resolución y registro de actuación. Distinguir datos
de prospectos del proveedor de los datos que trata por cuenta de cada cliente.

## Referencias y límite jurídico

- [Constitución de Honduras, art. 182, texto del Poder Judicial alojado en WIPO Lex](https://www.wipo.int/wipolex/es/legislation/details/2137):
  reconoce hábeas data respecto de registros públicos y privados. Esto respalda
  revisar el proceso de atención a titulares; no establece por sí solo todos los
  plazos operativos sugeridos ni hace universal un derecho de portabilidad.
- [Ley de Protección al Consumidor, Decreto 24-2008, biblioteca oficial TSC](https://www.tsc.gob.hn/biblioteca/index.php/leyes/68-ley-de-proteccion-al-consumidor):
  referencia para la revisión local de condiciones comerciales. La descarga
  completa excedió el límite del lector; no se emite una conclusión artículo por
  artículo ni sobre la validez de una cláusula concreta.
- [Decreto 75-2024, TSC](https://www.tsc.gob.hn/web/leyes/Decreto-75-2024.pdf):
  se comprobó una reforma con disposiciones específicas de telecomunicaciones;
  no se extrapolan sus límites de contratación al ERP o a transporte.

Esta revisión identifica contradicciones y faltantes verificables. No constituye
dictamen de cumplimiento ni revisión exhaustiva de normativa vigente. La aplicación
de normas extranjeras depende de clientes, destinatarios y operaciones reales,
incluida Miami; no se presume aplicación automática de GDPR por usar infraestructura
internacional. La validación final corresponde al asesor jurídico con los contratos
y datos del negocio.

## Orden de ejecución y evidencia necesaria

1. Titular: confirmar identidad, marcas, dominio/buzón y condiciones logísticas.
2. Producto y asesor jurídico: aprobar textos separados de software, privacidad y
   servicio logístico; corregir promesas contradictorias y definir anexos.
3. Desarrollo: acceso público a los documentos y aceptación versionada con
   persistencia protegida, sin cambiar permisos operativos del portal.
4. Operación: acreditar atención del buzón, inventario de proveedores, conservación,
   exportación/borrado y notificación de incidentes conforme a lo aprobado.
5. Publicación: fecha real, archivo de versiones, verificación pública sin sesión
   y prueba del flujo de aceptación. Hasta entonces, cobertura pendiente.

Validaciones de esta entrega: lectura y búsquedas de fuentes, contraste de textos
y flujos, consulta de referencias públicas y revisión del diff documental. No se
modificaron código, SQL, políticas publicadas ni condiciones comerciales.

## Actualización tras autorización del titular — 07/09/2026

El titular confirmó Hernova Systems como nombre comercial, sin sociedad constituida,
el dominio forwarders.app y contacto@forwarders.app. Se sustituyó DHer en los textos
actuales y metadata, conservando las ediciones anteriores como archivo histórico.
No se aportaron nombre personal, domicilio ni RTN: la identidad legal sigue pendiente.

Implementación local de POL-01 a POL-08:

- Textos de plataforma y logística separados y versionados, canal de derechos,
  finalidad de demos, destinatarios, cookies, conservación y cambios de condiciones.
- Retirada de respuesta fija de tres días y condiciones logísticas no confirmadas;
  no se recalculan tarifas ni se modifican contratos/operaciones existentes.
- Ruta pública `/terminos-logisticos`, archivos descargables e índice móvil.
- Casilla explícita y lectura previa en registros. Migración para captura de la
  declaración con fecha del servidor y catálogo de versiones/hashes protegido.
- Guía de publicación y anexos operativos en `privacy-operations-runbook.md`.

Verificación local: TypeScript y lint dirigido; 21 pruebas Node; build 71/71;
Chrome 320/390/1440, descargas públicas, portal protegido, casilla obligatoria,
fallo/reintento/doble submit y declaración ERP/portal con solicitudes interceptadas.
SQL y RLS de las nuevas tablas probados en PostgreSQL local con rollback.

No se aplicó la migración en remoto ni se publicó esta edición. La identidad,
validación jurídica, condiciones comerciales, regiones/proveedores efectivos y
procesos operativos siguen pendientes. El alta legacy sin declaración permanece
compatible y no crea evidencia ficticia; no se acredita aceptación universal,
contratación por organización ni confirmación de identidad mediante la casilla.
