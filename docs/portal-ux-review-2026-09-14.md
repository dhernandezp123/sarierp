# Revisión UX del portal del cliente

Fecha: 14/09/2026. Estado: análisis y propuesta; cambios del portal pendientes.

## Diagnóstico

La base visual es aprovechable: tarjetas legibles, formularios relativamente cortos, seguimiento por etapas y acceso móvil persistente. El problema principal es que el cliente puede consultar información, pero no siempre sabe qué requiere su atención, cómo resolverlo o si los datos están completos.

Recomiendo conservar la identidad y los componentes existentes, y mejorar primero la fiabilidad de lo mostrado y los recorridos de autoservicio. No propongo rediseñar el portal desde cero.

## Alcance y evidencia

- Inspección de las 22 páginas en `src/app/portal`, layout, componentes compartidos, hooks y consumidores de RPC relacionados.
- Renderizado local de los componentes con datos simulados; revisión de dimensiones en 1280, 390 y 320 px, capturas y comprobación visual de pantallas representativas. El acceso público se volvió a capturar después de esperar la carga de estilos.
- Casos reproducidos: buscar un paquete posterior a los primeros 20, error de consulta de paquetes, cambio de unidades, factura que requiere corrección, estados de asignación y transporte distintos, plazos con otra zona horaria y mensajes largos.
- No se enviaron formularios, archivos, correos ni solicitudes reales. No se modificaron datos, permisos ni producción. Las operaciones de escritura del entorno simulado estaban bloqueadas.
- Esta revisión no certifica autenticación real, RLS, entrega de correos, carga de archivos ni aceptación operativa. Esos recorridos requieren UAT al implementar. Las observaciones editoriales no certifican condiciones legales ni restricciones de transporte.
- Las capturas y observaciones de prueba quedan en `.ua/intermediate/portal-*`, ignoradas por Git. La ruta temporal de revisión se retira al terminar.

## Qué conservar

- Separación entre paquetes individuales y envíos logísticos: son conceptos distintos y no deben fusionarse sin revisar su relación operativa.
- Cronología del paquete y desglose de un envío con varios bookings.
- Enlace de prealerta recibida al paquete correspondiente.
- Indicadores de avisos sin leer y accesos reales a teléfono, correo y mapas.
- Límites y formatos de factura ya definidos, y documentos privados mediante enlaces firmados.
- Retorno al destino solicitado después del login, respuesta discreta de recuperación de contraseña y versiones de condiciones aceptadas.

## Hallazgos prioritarios

P1: resolver en la primera entrega. P2: mejorar el recorrido principal. P3: mejoras posteriores o sujetas a definición operativa. Estos IDs identifican propuestas; no representan fixes completados en HARDENING.

| ID | Prioridad | Hallazgo y evidencia | Ajuste recomendado |
| --- | --- | --- | --- |
| UX-PORTAL-01 | P1 | Paquetes consulta 20 registros y después filtra localmente. Con búsqueda o filtro activo desaparece «Cargar más». Reproducido: el paquete 25 existe, pero aparece «Sin resultados». | Buscar y filtrar sobre el conjunto autorizado completo, con paginación compatible; conservar filtros al regresar del detalle. |
| UX-PORTAL-02 | P1 | Varias consultas ignoran errores. Un fallo simulado en paquetes muestra «No tienes paquetes aún»; otras páginas tienen el mismo patrón en código. | Separar carga, vacío real, error y falta de vinculación de cuenta. Ofrecer reintento y no presentar ceros como datos confirmados tras un fallo. |
| UX-PORTAL-03 | P1 | En detalle de paquete, tener documentos produce una insignia verde «Recibida» aunque la última factura diga «Requiere corrección». Reproducido. | Mostrar el estado vigente de revisión, motivo y acción «Subir factura corregida» antes del historial. |
| UX-PORTAL-04 | P1 | Detalle de envío formatea un plazo en la zona del navegador y añade el nombre de otra zona. Reproducido con navegador en Honduras y plazo de Nueva York. | Convertir la hora a la zona que se etiqueta; indicar claramente zona y fecha. Ejemplo de prueba: 15:00 UTC del 15/09/2026 corresponde a 11:00 en Nueva York, mientras la pantalla mostraba 09:00 junto a esa zona. |
| UX-PORTAL-05 | P1 | La cabecera del paquete puede indicar «En bodega» por asignación mientras la cronología indica «En Tránsito». Reproducido. | Distinguir estado del transporte, asignación a envío y revisión documental; definir una presentación coherente con los campos vigentes. |
| UX-PORTAL-06 | P1 | No se permite seleccionar un paquete entregado para reportar problemas y su detalle oculta la acción. Confirmado en código. | Permitir el recorrido de daño o faltante detectado tras la entrega según elegibilidad y plazos que defina Operaciones. No cambiar reglas de aceptación automáticamente. |
| UX-PORTAL-07 | P1 | Inicio pide «Configura tu dirección en Miami» pero el destino es una página de consulta. Además, ambas pantallas determinan disponibilidad con fuentes diferentes. Reproducido con dirección de empresa y código disponibles. | Usar el mismo criterio de disponibilidad. Mostrar «Ver y copiar mi dirección» o explicar que la cuenta requiere vinculación y ofrecer ayuda. |
| UX-PORTAL-08 | P1 | Al alternar pulgadas y centímetros se mantienen los números y cambia su significado. Una caja de 12 × 12 × 12 pasa de 1.0000 a 0.0610 FT³. Reproducido. | Convertir las medidas al cambiar unidades o explicar explícitamente que se está eligiendo la unidad de entrada. Presentar el peso de referencia como estimación, evitando una promesa de cobro universal. |
| UX-PORTAL-09 | P1 | En móvil, detalle de paquete llega a 408 px de ancho con viewport de 320/390 px; en Notificaciones la acción ocupa espacio del título. Reproducido. | Reorganizar cabeceras, permitir saltos de línea y apilar fechas largas. Ninguna información ni acción debe quedar fuera de la pantalla. |
| UX-PORTAL-10 | P2 | Seis destinos en la barra móvil y dos usos del icono de campana. Incidencias carece de acceso directo en la navegación principal; varias herramientas están dentro de Perfil. | Reducir la navegación a cinco destinos y agrupar solicitudes con acceso contextual desde paquetes y envíos. |
| UX-PORTAL-11 | P2 | Formularios y búsquedas tienen campos sin etiqueta asociada; algunos botones de icono no tienen nombre accesible y los filtros no anuncian su selección. | Etiquetas visibles asociadas, nombres de botones, estados accesibles, foco perceptible y selección de paquete utilizable con teclado. |
| UX-PORTAL-12 | P1 | Marcar avisos como leídos actualiza la interfaz sin comprobar el error; copiar dirección confirma sin esperar al portapapeles. Confirmado en código, sin ejecutar escrituras reales. | Confirmar el éxito al completar la operación; conservar o restaurar el estado ante fallos y mostrar cómo reintentar. |

## Revisión de todas las páginas

| Página | Evaluación y propuesta |
| --- | --- |
| `/portal` | Priorizar «Requiere tu atención»: documentos por corregir, próximas fechas y solicitudes pendientes. Después mostrar carga activa. Hacer navegables indicadores y paquetes recientes. Explicar «qué sigue» y ofrecer dirección Miami/prealerta como acciones claras. Corregir textos que equiparan todos los envíos activos con tránsito. |
| `/portal/login` | Conservar la estructura y los campos con etiquetas correctas. Unificar identidad del operador y plataforma. Convertir «Contacta a tu agente» en ayuda accesible sin sesión. Diferenciar cuenta pendiente, inactiva y fallo de conexión sin revelar información sensible. |
| `/portal/register` | Mantener «Solicitar acceso», porque existe aprobación manual. Añadir etiquetas persistentes, requisitos de contraseña visibles y confirmación duradera con próximos pasos; hoy un toast seguido de login puede perder el contexto. Revisar cómo se identifica un cliente particular si no tiene empresa. Preservar aceptación legal. |
| `/portal/forgot-password` | Conservar mensaje que no confirma si existe una cuenta y tratamiento del enlace expirado. Añadir etiqueta visible, posibilidad de corregir correo y explicación del reenvío. Manejar también excepciones de conexión con recuperación clara. |
| `/portal/reset-password` | Mostrar etiquetas, requisitos antes de enviar y controles para ver ambas contraseñas. Diferenciar fallo al validar sesión de enlace inválido. Mantener salida a solicitar otro enlace y confirmación del cambio. |
| `/portal/paquetes` | Corregir alcance de búsqueda y filtros antes de cambiar el diseño. Organizar por activos/entregados, mostrar estado real de transporte y facilitar copiar tracking. Ofrecer prealertar una compra en un vacío real. |
| `/portal/paquetes/[id]` | Orden sugerido: estado actual, acción pendiente, datos y factura, seguimiento, historial ampliable. Corregir insignias contradictorias y desbordamiento móvil. Dar acceso al envío relacionado cuando exista. Facilitar copia de tracking y consulta de factura; conservar versiones sin confundirlas con el documento vigente. |
| `/portal/envios` | La llamada actual solicita solo envíos no completados. Añadir «Activos / Historial» utilizando el soporte existente de la RPC, sujeto a verificar permisos. Explicar modos de transporte con lenguaje comercial y evitar exclusiones por filtros incompletos. Mantener tarjetas de ruta. |
| `/portal/envios/[id]` | Mostrar primero ruta, situación actual, próxima fecha y lo que debe hacer el cliente. Las solicitudes documentales necesitan acción y vencimiento visibles. Simplificar etiquetas: salida/llegada estimada, días libres. Dejar datos técnicos y cada booking en secciones expandibles. Sustituir el hito fijo «Llegó a Honduras» por el destino aplicable. Descargas solo para documentos expresamente publicados al cliente. |
| `/portal/pre-alertas` | Añadir búsqueda, filtros de estado y acceso a información completa. Conservar enlace al paquete recibido. Evaluar edición/cancelación únicamente de solicitudes pendientes, sin alterar prealertas conciliadas. Diferenciar fallos de consulta de lista vacía. |
| `/portal/pre-alertas/nueva` | Mantener formulario corto y explicar «avísanos de una compra que llegará a Miami». Clarificar fecha de llegada prevista, permitir indicar el transportista cuando se elige Otro y revisar bloqueo de fechas pasadas para compras atrasadas. Mostrar confirmación con tracking. Factura anticipada sería una ampliación posterior con relación documental definida. |
| `/portal/notificaciones` | Añadir «Sin leer / Todas», historial paginado y lectura completa del mensaje. Los avisos actuales se limitan a 50 y el cuerpo se recorta. Abrir la gestión exacta que necesita atención. Confirmar marcado de lectura y reorganizar título/acción en móvil. |
| `/portal/incidencias` | Dar acceso visible desde Solicitudes/Ayuda. Mostrar referencia del caso, paquete, estado y última actualización; ampliar descripción y resolución. No afirmar que «todo va bien» cuando falla la consulta. Conversación y archivos propios requieren una ampliación del flujo. |
| `/portal/incidencias/nueva` | Conservar selección contextual desde paquete. Hacer accesible el selector, explicar qué datos ayudan a resolver el caso y entregar un comprobante consultable. Revisar elegibilidad después de entrega. Si se piden fotos por WhatsApp/correo, ofrecer un enlace contextual real; integrar adjuntos solo con soporte de almacenamiento y permisos. |
| `/portal/pickup` | Hacer visible en Solicitudes. Distinguir fecha solicitada de recogida confirmada, aclarar lugar y contacto, y permitir consultar dirección completa y referencia. Revisar servicio/zona disponible con Operaciones. Editar/cancelar mientras esté pendiente sería una mejora condicionada a las transiciones reales. Reorganizar cabecera móvil. |
| `/portal/perfil` | Convertir en Cuenta: datos personales, código de cliente, seguridad y preferencias disponibles. Mover gestiones operativas fuera de Perfil. Retirar filas deshabilitadas de biometría/actualizaciones/tutoriales hasta que funcionen. Unificar requisitos de contraseña con registro y recuperación; explicar cómo corregir datos de solo lectura. |
| `/portal/perfil/direccion-miami` | Titular «Tu dirección para compras». Mostrar nombre destinatario, dirección, suite/código, ciudad, estado, ZIP y teléfono con copia completa y por campo. No presentar como lista una dirección sin identificación del cliente. Ofrecer ayuda cuando falte configuración y confirmar copia tras éxito real. |
| `/portal/calculadora` | Corregir cambio de unidades y validar medidas positivas y finitas. Aclarar unidad de peso independiente, explicar resultados con lenguaje sencillo y separar volumen, peso físico y peso de referencia. Revisar factor y servicio antes de afirmar lo que se cobrará. Mejorar espacio de campos en pantallas pequeñas. |
| `/portal/contacto` | Conservar llamadas, correo y mapas reales. Dar visibilidad contextual desde ayuda y trámites. Publicar horarios y zonas horarias verificados, evitando un «EST» fijo para Miami. Mostrar error de carga frente a ausencia de configuración. |
| `/portal/info/restringidos` | Añadir índice o búsqueda y un contacto real para consultas. Diferenciar prohibido, sujeto a autorización y dependiente de origen/destino/modalidad, tras validación operativa del contenido. Mostrar fecha y responsable de revisión. No se evaluó la validez normativa del listado. |
| `/portal/info/nosotros` | Conservar una presentación breve del operador y servicios con contacto. Validar las cifras y promesas fijas —clientes, entregas, años y tiempo de respuesta— antes de mostrarlas como hechos. Aclarar relación Sari Express / Forwarders ERP / Mi Carga. |
| `/portal/info/terminos` | Conservar documento, versión y aceptación. Facilitar índice móvil, navegación por secciones e impresión. La descarga actual ofrece JSON: añadir formato legible para el cliente sin sustituir el registro canónico ni editar cláusulas por motivos visuales. |

## Navegación propuesta

Cinco destinos principales en móvil: **Inicio · Paquetes · Envíos · Solicitudes · Cuenta**.

- **Inicio:** acciones pendientes, carga activa, dirección Miami y acceso rápido a crear prealerta.
- **Paquetes:** búsqueda completa y seguimiento de cada compra recibida.
- **Envíos:** operaciones activas e historial; relación con paquetes cuando esté disponible.
- **Solicitudes:** prealertas, recogidas e incidencias, cada una con su ciclo vigente. Sería una pantalla de acceso, no una unificación de tablas ni estados.
- **Cuenta:** perfil, seguridad, dirección y contenidos informativos secundarios.

Avisos queda en la campana superior con contador y nombre accesible. Ayuda debe estar al alcance desde Inicio, Cuenta y el contexto de cada problema. En escritorio puede conservarse navegación superior con los mismos nombres. Cada página secundaria debe tener un destino de regreso predecible, incluso si se abrió por enlace directo.

## Orden de implementación sugerido

1. **Información fiable:** búsqueda completa, estados de consulta, factura corregible, hora/zona, estado del transporte, dirección disponible, resultado de acciones y unidades. Corregir los problemas móviles detectados en esas páginas. No requiere un rediseño general.
2. **Recorridos principales:** nueva navegación, Inicio orientado a acciones, detalle de paquete/envío, historial y lectura de avisos. Establecer componentes consistentes de carga, vacío, error, formulario y confirmación accesibles.
3. **Autoservicio ampliado:** elegibilidad de incidencias tras entrega, edición/cancelación de solicitudes, evidencias y documentos publicados. Definir primero permisos, estados y condiciones con Operaciones. Revisar contenidos de ayuda, empresa y descarga de términos.

No incluiría por ahora chat nuevo, biometría, promesas de tiempo de respuesta ni un motor de tarifas: requieren capacidades y decisiones ajenas a esta mejora UX.

## Criterios de aceptación para los ajustes

- Un tracking existente puede encontrarse aunque no esté en los primeros 20 registros; búsqueda y paginación mantienen el filtro.
- Ningún fallo de consulta se presenta como «sin paquetes» o saldo de actividad cero confirmado; el reintento recupera la pantalla.
- La factura rechazada/corregible identifica motivo, documento vigente y siguiente acción sin una señal verde contradictoria.
- Hora, fecha y zona del plazo coinciden; probar navegador en Honduras y cambios de horario de Miami/Nueva York.
- Estado operativo, asignación y revisión documental no se contradicen ni se presentan como equivalentes.
- La dirección puede copiarse con identificación válida del cliente; si falta, se explica cómo resolverlo.
- Cambiar unidades conserva la magnitud física si el control funciona como conversión.
- A 320, 390 y 1280 px se pueden leer títulos, fechas, tracking y acciones sin desbordamiento horizontal.
- Formularios, selectores y navegación funcionan con teclado, foco visible y etiquetas accesibles; volver del detalle conserva contexto.
- Éxito y error de lectura de avisos, copia, solicitudes y documentos reflejan el resultado real. Probar sesión aprobada, pendiente, inactiva y cliente sin vincular sin enviar datos a producción.
- Validar recorridos autenticados y RLS por separado; mocks y compilación no los sustituyen.

Al implementar, registrar cada fix en `HARDENING.md`, ejecutar las verificaciones requeridas por el repositorio y separar lo probado de cualquier SQL, permiso o UAT pendiente. Este documento no declara ningún fix del portal completado.
