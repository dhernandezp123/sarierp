# Cartera, Caja/Bancos, CAI y selectores — 28/10/2026

Publicación coordinada autorizada por el propietario. Incluye el plan financiero
preparado, control fiscal por oficina/tipo, administración auditada de CAI por
máster, autorización individual de emisión por oficina y formularios compactos.

## Preparación verificada

- Principal: rama `main`, dominio `sari.forwarders.app`, proyecto de datos
  `fwspgdzvlbtbgiupvrzo`; baseline de 113 tablas públicas con RLS.
- Pruebas: rama `demo`, dominio `demo.forwarders.app`, proyecto de datos
  `wlssekvxpfxhwedsjhpz`; baseline de 116 tablas públicas con RLS.
- Seis migraciones pendientes en ambos: `20261028120000`, `20261028130000`,
  `20261028140000`, `20261028150000`, `20261028160000`, `20261028170000`.
  Outlook continúa fuera de este despliegue.
- Producción conserva su máster de Contabilidad aprobado y activo. Tiene siete
  rangos fiscales registrados al momento de esta revisión; sus fechas, estados,
  rangos y siguientes números se preservan. La verificación inicial de CAI más
  antigua no representa los datos que Contabilidad ya ingresó posteriormente.
- Pruebas conserva su configuración propia: no tiene rangos ni máster designado.
  Su Admin puede designar una cuenta ficticia elegible desde Configuración.

## Orden de publicación

1. Confirmar ambos cambios locales y comprobar paridad de código compartido.
2. Ensayar el SQL en cada base dentro de una transacción revertida, con bloqueos
   acotados y comprobación de datos originales, usuarios, identidad y numeración.
3. Aplicar únicamente las seis migraciones confirmadas, en transacción atómica
   por ambiente, registrando sus fuentes en el historial de Supabase.
4. Publicar `main` en Producción y `demo` como Preview; nunca usar destino de
   Producción para Demo. Mantener sus controles JWT/caducidad, noindex, bloqueos
   de correo/Storage y marcas de documentos.
5. Comprobar CI, checks de paridad, deployment Ready, dominios y versión efectiva.

Las huellas se comparan dentro de la transacción para permitir el trabajo humano
posterior. El único cambio previsto sobre campos originales son los códigos SAR
vacíos y la discrepancia TGU `000-000` → `000-001` detectada en el preflight,
conforme al prefijo confirmado por el propietario y registrado en todos sus
rangos. La migración solo acepta ese caso conocido, verifica documentos y deja
auditoría administrativa en `activity_logs`, sin suplantar usuarios. No se alteran sus
documentos, CAI, saldos ni correlativos. No se crean bancos ni saldos de apertura,
no se activa contabilidad automática y no se copian secretos o datos entre bases.

## Operación que debe completar el máster

La autorización por oficina es individual, conforme a la decisión del propietario.
El máster puede emitir en todas las oficinas activas; los otros usuarios requieren
que se les habilite SPS, Tegucigalpa o ambas en **Contabilidad → Configuración**.
No se infieren oficinas ni se otorgan permisos a todos por defecto. Hasta recibir
esa autorización, pueden consultar/preparar borradores según su rol, sin emitir.

## Validación y evidencia

Local: TypeScript, compilaciones de ambos árboles, 504 pruebas Node principales,
510 de Pruebas, 30 suites SQL/RLS principales y seis de Pruebas con rollback;
selectores con ocho comprobaciones de navegador y lint dirigido sin regresiones.
Paridad: 539 archivos compartidos, 26 variantes revisadas, sin diferencias
inesperadas. La configuración Trial permanece separada.

## Publicación verificada

Commits funcionales: main `fdf54c5` (incluye `62b5954`) y Demo `0d74b67`
(incluye `d2ddf96`). Fuentes de las seis migraciones aplicadas verificadas por
hash en ambos historiales. Preservadas las filas originales de 113/116 tablas,
usuarios y máster; únicamente se corrigió el punto TGU y se añadió su auditoría.
Los siete CAI de Producción conservan íntegros rangos, fechas, estado y siguiente
número. Pruebas conserva cero CAI y su propia configuración.

Postflight: 131/134 tablas públicas con RLS; 412 funciones compartidas, ninguna
ausente y las 40 nuevas idénticas. Las diferencias previas de sandbox/formato no
aumentan. No se activó contabilidad ni se crearon bancos, aperturas o permisos.

| Ambiente | CI Quality | Deployment funcional Ready | Smoke |
| --- | --- | --- | --- |
| [Producción](https://sari.forwarders.app) | [40780475897](https://github.com/dhernandezp123/sarierp/actions/runs/40780475897) | [rhpfu450u](https://sarierp-rhpfu450u-claudherhn-5641s-projects.vercel.app) | 22 rutas |
| [Pruebas](https://demo.forwarders.app) | [40780480535](https://github.com/dhernandezp123/sarierp/actions/runs/40780480535) | [pcio35kj1](https://sarierp-pcio35kj1-claudherhn-5641s-projects.vercel.app) | 28 rutas |

[Paridad continua 40780480542](https://github.com/dhernandezp123/sarierp/actions/runs/40780480542)
aprobada. Los dominios sirven el mismo manifest que su deployment inmutable.
Las nuevas rutas exigen sesión; la API de extractos rechaza anónimos con 401.
Demo mantiene noindex, marca ficticia, logos reales bloqueados e invitaciones
rechazadas antes de contactar Auth/correo.

Pendiente con Contabilidad: autorizar oficinas a los usuarios de Producción,
designar un máster ficticio en Pruebas, completar parámetros contables/fiscales
reales y ejecutar UAT. El smoke HTTP sin sesión no certifica aceptación autenticada.
