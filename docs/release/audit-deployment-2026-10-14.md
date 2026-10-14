# Despliegue de auditoría — 14/10/2026

## Resultado comprobado

Código y SQL publicados. La configuración protegida de ambiente permanece en
Demo, con correo bloqueado, pendiente de autorización específica del propietario.
La aceptación funcional y los SLA serán validados por el administrador solicitante.

| Evidencia | Resultado |
| --- | --- |
| Commit funcional | c767762d40aa657892c5b62d5ea85e17b22fba64, publicado en origin/main |
| CI | [Quality 38645720142](https://github.com/dhernandezp123/sarierp/actions/runs/38645720142), application/database success |
| Vercel | dpl_Ce8vhFUzn3wocVfr2v4UmKcCyL9z, Production READY |
| URL inmutable | https://sarierp-c576m0vco-claudherhn-5641s-projects.vercel.app |
| Dominio | https://sari.forwarders.app, candidato promovido después del postflight SQL |
| Supabase | fwspgdzvlbtbgiupvrzo, 121 migraciones, última 20261014154000 |
| Outlook | 20261002120000 excluida del paquete; standby conservado |
| Validación local | 318 pruebas, TypeScript, build 82 páginas, ocho suites SQL/RLS, seis grupos Chrome |
| Lint | Gate aprobado: 373 archivos, 223 diagnósticos históricos, cero regresiones |

## Integridad y permisos

Preflight: 105 migraciones. Se aplicaron exactamente las 16 del paquete de
auditoría, con copia de esquema previa y SHA-256 de cada archivo en evidencia
local ignorada. No se modificaron migraciones aplicadas ni se reparó el historial
para simular la ejecución de Outlook.

Las huellas anteriores y posteriores coinciden para cotizaciones (excepto campos
nuevos de revisión/retorno y updated_at), pricing_items, agent_quotes, shipments,
bookings, paquetes y obligaciones/pagos. Conteos: 316 cotizaciones, dos paquetes,
cero obligaciones, pagos e incidencias. Sin cambios de importes, estados comerciales,
documentos ni transporte como parte de esta publicación.

RLS permanece activo en las tablas auditadas. Ninguna RPC de auditoría evaluada
es ejecutable por anon; cero cores internos expuestos a authenticated. La tabla
de ambiente no admite lectura del cliente ni escritura de service_role.
Estas comprobaciones de catálogo no sustituyen UAT autenticada en destino.

Los cuatro repricings con operación tenían como último historial explícito
Ganada→Pendiente de Fijar Precios. El backfill restringido ya contenido en
20261014121000 recuperó su estado de retorno; postflight: cero casos sin retorno.
No se ejecutó la RPC owner-only adicional de 20261014154000 ni se aprobaron precios.
No existe una recuperación manual adicional pendiente para esos cuatro casos.

## Publicación y smoke

Se construyó con --prod --skip-domain, se comprobó que el dominio comercial
conservaba la versión anterior, y se promovió el candidato tras SQL/RLS/huellas
y CI verde. Configuración de Vercel, claves y módulos opcionales conservados.

- Login: 200. Pricing/CxP/Miami/factura manual: 307 a login sin sesión.
- API manual y avisos Miami/soporte: 401 JSON sin sesión.
- Ejecutor Outlook: 503 de standby antes de sesión/DB/proveedor.
- Una solicitud JSON inválida, sin credenciales, comprobó 500 con referencia en
  cuerpo/header y el mismo evento JSON en logs Vercel. Falló antes de auth/negocio;
  sin token, email, documento ni excepción privada en el diagnóstico.
- Chrome/155 con perfil aislado: guard de edición, enlaces/Cancelar/Atrás,
  fallo/confirmación, reemplazo manual a 390 px y demo interceptada/doble submit.
  No se usaron sesiones ni datos reales de negocio en el ensayo.

## Configuración pendiente y aceptación

La migración de ambiente empieza en Demo por seguridad. La revisión automática
de permisos rechazó la consulta combinada que habría configurado Production y
ejecutado cuatro recuperaciones manuales, por considerar insuficientemente
específica la autorización general de despliegue. Esa consulta no se ejecutó.
La revisión posterior mostró que las recuperaciones ya estaban resueltas por
la migración anterior. Solo queda pendiente autorizar expresamente el cambio
de platform_environment a production en este proyecto; el correo sigue bloqueado.

El administrador confirmó que él mismo validará flujos y SLA. Pendientes:
tres expedientes integrales, plazos/responsables por área, navegadores adicionales,
mediciones representativas de pricing/booking/móvil y políticas de merge/retención
según la operación. La refactorización de páginas extensas sigue siendo incremental.
No se declara completa esa aceptación por tener CI y smoke correctos.

## Evidencia local

Los artefactos de esquema, inventario, huellas, reportes SQL, navegador, CI y
smoke están en .ua/intermediate y no se publican. La limpieza tras un fallo de
repack por espacio retiró solo builds/caché propios y el pack temporal fallido;
el commit y su conectividad se comprobaron y el push terminó correctamente.
El stack aislado fue detenido conservando volúmenes y la base principal local
no se modificó. No hubo correo, lead real, OCR externo, pago o despacho de prueba.
