# Operación de privacidad y publicación de términos

Edición de trabajo: 07/09/2026. No es un contrato firmado ni prueba de ejecución.

## Identidad y separación de servicios

El titular confirmó Hernova Systems como nombre comercial no constituido en
sociedad, `forwarders.app` y `contacto@forwarders.app`. No proporcionó nombre legal,
domicilio ni identificación tributaria personales. No inferirlos del usuario del
equipo ni de nombres históricos. Completar identificación antes de cerrar la
documentación contractual; el nombre comercial no sustituye a la persona titular.

Sari Express opera la logística. Sus datos legales y canal comercial deben
confirmarse en la cotización/contrato. El buzón de plataforma puede canalizar
solicitudes del portal, pero no se presenta como quien resuelve reclamaciones de
transporte ni como asegurador.

## Inventario por confirmar con el titular y operador

| Elemento | Evidencia técnica | Dato operativo pendiente |
| --- | --- | --- |
| Supabase | Cliente, autenticación, BD y almacenamiento en código | Proyecto/ambiente, región, contrato de tratamiento, responsables de acceso y backups |
| Resend | APIs de notificaciones de soporte y paquetes | Activación por ambiente, dominios/remitentes, datos enviados, retención y acuerdo |
| Hosting | Aplicación Next.js; las políticas permiten Vercel u otro contratado | Proveedor real, regiones, logs, integraciones y contrato |
| Correo de contacto | contacto@forwarders.app confirmado por titular | Responsable y suplente que atienden solicitudes; prueba autorizada de recepción |
| Logística | Paquetes, documentos, envíos y contactos de clientes | Transportistas, agentes, bodegas y autoridades destinatarias según operación |

No documentar proveedores como certificados, regiones o SLA como garantizados sin
confirmación. Revisar también cualquier integración añadida desde el hosting.

## Conservación y salida: anexo que debe acordarse

| Categoría | Criterio propuesto | Definir antes de prometer un plazo |
| --- | --- | --- |
| Prospectos | Atención y seguimiento solicitado; cierre al desaparecer la finalidad | Frecuencia de revisión, ejecución de borrado/anonimización y responsable |
| Usuarios y aceptación | Gestión de cuenta y evidencia de declaración | Conservación legal, validación de identidad/correo y tratamiento al dar de baja |
| Operaciones, facturas y documentos | Servicio, obligaciones fiscales y reclamaciones aplicables | Plazos por tipo y jurisdicción validados por asesor/contador |
| Archivos y soporte | Necesidad de atención y documentación de incidencias | Límites, acceso, ciclo de depuración y adjuntos |
| Logs e incidentes | Seguridad, diagnóstico y evidencia necesaria | Retención por proveedor y permisos |
| Respaldos | Continuidad conforme al plan real | Frecuencia, rotación, RPO/RTO y prueba de restauración |

Para exportaciones, acordar alcance, formatos, adjuntos, entrega segura, plazo y
asistencia/costos antes de ejecutarlas. No confundir desactivar cuenta con borrar
datos. Antes de una restauración, reconciliar solicitudes de eliminación atendidas.

## Atención de derechos e incidentes

1. Registrar recepción, tipo de solicitud, referencia mínima y persona asignada.
2. Verificar identidad o representación de forma proporcional, sin pedir contraseña
   ni documentos completos por defecto. No revelar existencia o datos de otra cuenta.
3. Distinguir prospectos propios del proveedor de datos tratados por cuenta del
   operador; canalizar estos últimos al responsable y documentar instrucciones.
4. Revisar obligaciones de conservación y sistemas/archivos/backups afectados.
5. Ejecutar la acción autorizada, verificar el resultado y responder con alcance,
   limitaciones justificadas y fecha. Respetar plazos legales aplicables; no se fija
   un plazo numérico no aprobado en esta guía.
6. Para incidentes, preservar evidencia mínima, contener y evaluar impacto; coordinar
   avisos a responsables, titulares y autoridades cuando corresponda según contrato
   y normativa. Registrar decisiones y responsables de comunicación.

Una prueba autorizada del buzón y ensayos de exportación/eliminación/restauración
siguen pendientes. Esta guía prepara el proceso, no acredita su operación.

## Versiones y aceptación técnica

- `/politicas` usa `public/legal/platform-2026-09-07.json`.
- `/terminos-logisticos` y la página autenticada del portal comparten
  `public/legal/logistics-2026-09-07.json`.
- Se conservan los textos de las secciones anteriores en archivos separados;
  el archivo anterior no equivale a una nueva condición ni a una aceptación.
- `.gitattributes` mantiene LF para que los hashes SHA-256 sean iguales en Windows
  y Linux. Los tests comparan bytes del documento con el hash de la migración.
- Los registros presentan casilla no premarcada, enlace en pestaña nueva y
  distinción entre aceptación de uso y lectura del aviso; no hay opt-in publicitario.
- La migración `20260907160000_signup_legal_acceptance.sql` registra una declaración
  al insertar `auth.users`, con versión del catálogo y fecha del servidor. Se
  rechazan declaraciones presentes pero inválidas. No cambia el trigger de perfiles.
- El registro es una declaración en el alta, no una firma avanzada, verificación
  de correo ni prueba de facultades para representar a una empresa. No copiarlo
  a un supuesto contrato organizacional ni completar retrospectivamente cuentas.
- Se permite el alta legacy sin declaración para no romper invitaciones ni
  integraciones existentes; queda sin evidencia y debe revisarse separadamente.
  No se afirma que toda cuenta tenga aceptación, ni se usa esto para conceder roles.
- Editar metadata después del alta no cambia evidencia. RLS permite solo lectura
  propia y no admite escrituras API de usuarios. La lectura administrativa requiere
  un canal backend autorizado; no se añade exposición de datos a administradores
  de otras organizaciones. El registro no captura IP ni datos adicionales.
- Al eliminar `auth.users` se elimina su evidencia por cascada. Antes de esa acción
  debe resolverse si existe conservación legal válida y qué evidencia mínima puede
  preservarse mediante procedimiento autorizado. No prometer historial eterno.

## Publicación

1. Revisar identidad pendiente y condiciones comerciales con el titular. No cambiar
   cotizaciones aceptadas ni documentos emitidos por actualizar estas páginas.
2. Aplicar la migración en staging, probar alta ERP/portal con confirmación de correo
   y comprobar evidencia, perfiles y aprobación. Verificar también invitaciones.
3. Aplicar la migración aprobada en producción **antes** del frontend. Sin ella,
   Supabase puede aceptar el metadata pero no existe el registro protegido.
4. Publicar la aplicación y comprobar ambas páginas y descargas sin sesión. Probar
   aceptación con cuentas autorizadas y comunicar cambios materiales cuando proceda.
5. Archivar ediciones aprobadas. Cuando cambie el contenido, usar nueva versión,
   nuevo archivo/hash, nueva migración de catálogo y actualizar el formulario;
   nunca reescribir una edición ya publicada ni su migración aplicada.

Validación local de SQL: suite `supabase/tests/signup_legal_acceptance.sql` dentro
de una transacción sobre una base con la migración. En esta entrega se ejecutó
migración y suite juntas con rollback en `supabase_db_sarierp`; no se aplicaron
cambios a staging ni producción. No ejecutar pruebas contra datos reales.

Actualización de publicación: el titular autorizó migración y despliegue juntos.
La migración se aplicó en Production el 07/09/2026 después de verificar que era
la única pendiente. El resultado final de Vercel y las comprobaciones posteriores
se registran en `HARDENING.md`, entrada POL-RELEASE-01. No se ejecutaron pruebas
de alta real ni envío de correos en producción; esos UAT siguen pendientes.
