# Scanner / Generador de factura manual — SARI USA

Ruta: `/manual-invoices`, menú Finanzas → Scanner / Factura manual.
Disponible para Admin, Operaciones, Finanzas y Contabilidad de Sari.

## Uso

1. Cargar una sola factura en PDF, JPG, PNG o WEBP de hasta 3 MB. El lector
   admite hasta 5 páginas de una factura. También se puede completar el
   formulario sin archivo. Para Word, exportar primero a PDF.
2. Elegir **Formato de fechas (OCR y PDF)**: MM/DD/YYYY para SARI USA o
   DD/MM/YYYY. Se aplica tanto a la lectura del original como al PDF generado,
   incluso al completar la factura manualmente, y se guarda con cada versión.
   Cambiarlo conserva el día/mes ingresados; para reinterpretar el original,
   volver a leer con OCR. Bajo cada fecha se muestra cómo aparecerá en el PDF.
3. Seleccionar **Leer con OCR**. La lectura gratuita se realiza en el dispositivo,
   con progreso y **Cancelar lectura**. La primera lectura descarga el motor y
   el modelo de idioma desde nuestra propia aplicación. No requiere clave API,
   saldo ni una instalación del usuario.
4. Comparar los campos amarillos con el original. Revisar las observaciones y,
   si faltan datos, abrir **Ver texto reconocido** para apoyar la transcripción.
   Los campos ilegibles quedan vacíos; un importe ausente nunca se convierte
   en cero. Revisar especialmente HBL/MBL, fechas, cargos, WR y total.
5. Confirmar la revisión y seleccionar **Visualizar PDF** para abrirlo en otra
   pestaña, o **Descargar PDF** para guardarlo en el dispositivo. Si el navegador
   bloquea la pestaña, permitir ventanas emergentes para el ERP o usar la descarga.
6. **Guardar documento** agrega una versión al historial. Abrir una versión y
   guardar cambios crea otra versión, conservando la anterior. El historial
   permite buscar y cargar páginas de versiones anteriores; no modifica cuentas
   por cobrar ni genera facturas fiscales.

El PDF reconstruye la plantilla en papel Letter: logotipo extraído del Word
aportado, encabezado SARI USA, recuadros, cargos, WR, total y Remarks fijos.
No incorpora resaltados. Los documentos extensos continúan en otras páginas
con el encabezado repetido y el total al final. Las fechas del PDF generado
respetan el formato seleccionado y el total usa el símbolo $ (dólares estadounidenses). Las
versiones antiguas sin formato guardado conservan DD/MM/YYYY al abrirse;
las nuevas usan MM/DD/YYYY de forma predeterminada. El total se deriva de los cargos,
con precisión de centavos, y se compara con el total leído cuando es legible.

El original y el texto reconocido permanecen solo en memoria del navegador.
El historial guarda los datos, no el original ni un PDF binario; el PDF se
regenera desde la versión guardada. Cerrar o recargar sin guardar pierde los
cambios. El módulo avisa antes de reemplazar datos y al cerrar la pestaña.

## Funcionamiento del OCR gratuito

- Tesseract.js 7.0.0 para imágenes y páginas escaneadas; PDF.js 6.2.108 para
  texto existente y rasterización de PDF. El usuario autorizó ambas librerías.
- Imports diferidos: el motor se carga al solicitar una lectura. Los workers,
  WebAssembly, fuentes y modelo inglés se sirven bajo `/ocr-assets/`.
- `predev` y `prebuild` ejecutan `scripts/sync-invoice-ocr-assets.mjs`, copiando
  archivos de las dependencias fijadas. El modelo de idioma está versionado
  en `public/ocr-assets/lang`; procedencia y licencias en `NOTICE.md`.
- Los recursos públicos son código/modelos sin documentos ni credenciales;
  solo este prefijo se excluye del proxy. Página, API de historial y RLS
  conservan los controles de acceso existentes.
- PDFs con texto suficiente usan su capa de texto. Los escaneados se procesan
  en un worker. Las imágenes se ajustan para lectura y se convierten a gris.
- El parser utiliza posiciones y etiquetas del formato SARI para separar
  columnas, cliente, referencias, cargos y WR. Números de factura diferentes
  provocan rechazo, sin combinar cargos. El texto del documento es solo datos.
- Límite de 3 MB, 5 páginas, 8 millones de píxeles para render y 3 minutos por
  lectura. Cancelar o salir libera los workers y los recursos disponibles.
- La velocidad depende del dispositivo. Fotos borrosas, recortes, inclinación
  o perspectivas pueden requerir correcciones. La revisión humana es obligatoria.
- El modelo de idioma puede quedar en IndexedDB; los documentos no se guardan
  allí. No hay llamadas del lector a OpenAI ni un servicio OCR externo.

## Servidor y opción anterior de OpenAI

La migración `20261012160000_manual_sari_usa_invoices.sql` ya está aplicada en
Supabase Production. No hay SQL nuevo por el cambio a lectura local.

La integración anterior de OpenAI sigue en código como opción administrativa,
pero la interfaz utiliza exclusivamente el lector gratuito. Para evitar llamadas
facturables desde la API anterior, `MANUAL_INVOICE_OCR_ENABLED` se establece en
`false` en Production y `.env.local`. La clave privada existente se conserva
en el servidor y nunca se envía al navegador.

La prueba anterior con una factura ficticia recibió `credit_balance_exhausted`.
La alternativa actual funciona independientemente de ese saldo y no consume
el cupo diario de la API OCR anterior.

## Validación y pendientes

Publicado en `https://sari.forwarders.app/manual-invoices` el 12/10/2026.
Build remoto correcto y recursos OCR verificados en el dominio de Production.

Los resultados de pruebas, verificaciones de navegador y publicación se
registran en `HARDENING.md`, UX-066 y UX-067. No se insertan documentos de prueba
en Production ni se envían originales a OpenAI durante estas verificaciones.

Antes de uso operativo, recorrer con sesión real: carga → lectura → comparación
→ edición → revisión → PDF → guardado → historial. Revisar escritorio/móvil,
teclado, pérdida de red y fotos de cámara. Aprobar la impresión contra el formato
SARI USA: logotipo rojo del Word frente a monocromo de la foto, encabezado y
Remarks. Los campos recuperados por OCR deben comprobarse contra el original.
