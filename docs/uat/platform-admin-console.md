# Consola de administración de Forwarders ERP

La ruta `https://forwarders.app/login` identifica el acceso administrativo de
plataforma. Un superadministrador entra a `/platform`; los usuarios operativos
continúan usando el dominio de su empresa, por ejemplo `sari.forwarders.app`.

## Permisos

La consola requiere un perfil con `is_platform_admin = true`, `tenant_id IS NULL`,
rol `Admin`, estado `Aprobado` e `is_active = true`. El rol Admin de una empresa
no concede estos permisos. El personal de soporte con flag de plataforma pero
sin rol Admin conserva únicamente la mesa de ayuda.

Los permisos se verifican en el layout servidor, en cada solicitud API y en cada
RPC de base de datos. Las mutaciones usan la sesión del usuario; no necesitan
service_role. No existe registro público de superadministradores ni un control
para conceder ese privilegio desde la consola.

## Uso

- **Resumen**: empresas activas/suspendidas, usuarios, solicitudes de aprobación,
  tickets abiertos y actividad reciente.
- **Empresas y accesos**: registrar una empresa y su subdominio, consultar sus
  dominios, copiar/abrir el acceso, cambiar el nombre administrativo y activar,
  suspender o archivar su acceso. El alta crea empresa, configuración inicial,
  dominio principal y auditoría en una transacción.
- **Usuarios**: buscar por nombre, correo o empresa; consultar rol, aprobación,
  habilitación y último ingreso. Administrar el rol interno y la aprobación o
  deshabilitación de usuarios pertenecientes a empresas activas. Una cuenta de
  Cliente necesita una vinculación válida para aprobarse; la vinculación se
  realiza desde la empresa. Las cuentas de plataforma y las cuentas sin empresa
  se muestran sin edición.
- **Actividad administrativa**: actor, fecha, entidad y motivo de cada cambio
  exitoso. Los estados anterior y posterior se conservan en la auditoría.
- **Mesa de ayuda**: reutiliza las rutas y permisos de soporte existentes.

Los listados tienen búsqueda y paginación de 25 registros. La búsqueda se envía
al pulsar Buscar. Los formularios conservan el borrador ante un error y bloquean
doble envío. Un cambio sobre una versión obsoleta se rechaza para evitar
sobrescribir el trabajo de otro administrador.

## Preparación de una nueva empresa

1. Registrar nombre y subdominio, indicando el motivo del alta.
2. Configurar/verificar DNS, TLS y alojamiento del subdominio. El registro en
   `tenant_domains` no sustituye esa configuración ni la de callbacks de Auth.
3. Compartir el enlace de acceso para que el administrador solicite su cuenta.
4. En Usuarios, aprobar esa cuenta con rol Admin y acceso habilitado.
5. El administrador de empresa completa sus datos corporativos, catálogos,
   configuración fiscal y demás información operativa desde su dominio.

El alta no copia datos, tarifas, catálogos privados ni documentos de Sari.
Suspender/archivar una empresa cierra la resolución pública de su dominio y
retira el contexto de sus sesiones operativas en RLS. Reactivar permite volver
a acceder a sus datos existentes. No hay eliminación de empresas ni traslado
de usuarios entre empresas en esta consola.

## Publicación

Aplicar `supabase/migrations/20261026160000_platform_admin_console.sql` antes
de publicar el frontend. La migración crea las RPC y la auditoría; no crea
superadministradores ni cambia el estado de empresas existentes.

Confirmar que la identidad autorizada de plataforma reúne las condiciones
anteriores. Si no existe, el propietario de la instalación debe provisionar un
usuario dedicado mediante el procedimiento administrativo del entorno. No
reclasificar una cuenta operativa ni publicar contraseñas o bypass de RLS.

Un rollback de frontend conserva las tablas y los eventos administrativos. No
borrar auditoría ni revertir suspensiones realizadas por administradores como
efecto de un rollback técnico.

## Matriz de aceptación

| Escenario | Resultado esperado |
| --- | --- |
| Login de superadmin en raíz | Abre Resumen y conserva destinos válidos de consola/soporte |
| Admin de Sari en raíz o consola global | Acceso rechazado; mantiene acceso a su empresa |
| Consola solicitada en un dominio de empresa | 404, sin lecturas administrativas |
| Plataforma inactiva, pendiente, Cliente o con tenant asignado | Acceso denegado |
| POST de otro origen o sin origen | Rechazado antes de llamar RPC |
| Registrar empresa | Empresa/configuración/dominio/evento completos, sin filas parciales |
| Nombre/subdominio/motivo inválido o dominio ocupado | Error claro y borrador conservado |
| Suspender y reactivar | Sesión operativa pierde/recupera contexto; otra empresa sigue funcionando |
| Aprobar administrador de empresa | Cambia rol/aprobación/habilitación y registra actor/motivo |
| Quitar último administrador activo | Rechazado; dos cambios concurrentes tampoco eliminan ambos |
| Usuario Cliente sin vinculación | No se puede aprobar desde la consola |
| Modificación simultánea del registro | Conflicto; actualizar y revisar antes de guardar otra vez |
| Fallo al insertar auditoría | Se revierte la mutación completa |
| Cerrar sesión/cambiar identidad durante una lectura | Respuesta antigua descartada y datos ocultos |
| Escritorio y móvil | Navegación usable, formularios etiquetados y tablas con desplazamiento contenido |

La validación automatizada local y el ensayo con identidades ficticias no
sustituyen el UAT autenticado en el ambiente publicado.

## Evidencia local del 26/10/2026

- 417 pruebas Node aprobadas, incluidas 12 de plataforma; TypeScript, build y
  lint sin regresiones.
- 20 suites SQL/RLS aprobadas en una copia aislada. Dos cambios concurrentes
  sobre los administradores de una empresa conservaron un administrador activo.
- Navegador: login hacia Resumen, presentación en escritorio/móvil, menú móvil y
  listado de empresas comprobados con identidad ficticia. La comprobación visual
  de todos los formularios queda pendiente por incidencias del servidor temporal
  y espacio de disco; la recuperación de errores y el bloqueo de doble envío se
  verificaron mediante pruebas de componentes.

Tras publicar, completar la matriz anterior con una identidad autorizada y una
empresa de prueba dedicada; no usar Sari para ensayar suspensiones o altas ficticias.
