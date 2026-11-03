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
3. Con IA habilitada, seleccionar **Leer con IA** para enviar el original a Claude
   (Anthropic) y extraer los campos. **Leer en este dispositivo** conserva la
   alternativa gratuita. Si la IA no está configurada, aparece **Leer con OCR**.
   La lectura local descarga el motor y el modelo desde nuestra aplicación;
   no necesita clave API ni saldo. Ambas opciones permiten cancelar la lectura.
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

En la lectura local, el original y el texto reconocido permanecen solo en memoria
del navegador. La lectura con IA envía el original al proveedor configurado a través
del servidor; se aplican las condiciones de tratamiento de datos de ese proveedor.
El servidor no guarda el original ni su contenido en logs. Registra únicamente
modelo, proveedor, duración y tokens de las lecturas finalizadas correctamente.
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

## Lectura con Claude y configuración del servidor

Variables exclusivas del servidor en Vercel Production o `.env.local`:

```env
ANTHROPIC_API_KEY=<clave real, nunca versionada>
MANUAL_INVOICE_OCR_PROVIDER=anthropic
MANUAL_INVOICE_OCR_MODEL=claude-sonnet-5-5
MANUAL_INVOICE_OCR_ENABLED=true
```

No usar `NEXT_PUBLIC_` para la clave. Las variables se aplican en un despliegue
nuevo. GET `/api/manual-invoices/ocr` devuelve solamente disponibilidad y proveedor
después de autorizar la sesión; nunca devuelve claves. No hay fallback automático
a otro proveedor de pago si falta la clave o falla la lectura.

La API usa Messages de Anthropic con PDF/imagen original en base64, razonamiento
adaptativo con esfuerzo `medium`, JSON Schema y máximo de 8192 tokens de salida.
No envía `temperature`. Valida los campos y fechas, conserva el formato seleccionado,
los importes cero y los vacíos; advierte diferencias entre cargos y total impreso.
Las respuestas truncadas o rechazadas no se aplican al formulario. Los errores o
cancelaciones conservan los datos previos y permiten lectura local.

Se conservan autorización por rol/tenant/dominio y cupo atómico de 20 intentos
diarios por usuario. El servidor revisa PDFs válidos, sin contraseña y de hasta
5 páginas antes de consumir cupo y llamar al proveedor. El límite permanece
en 3 MB. La inspección usa el PDF.js ya instalado, sin render ni acciones del PDF.
El proveedor tiene un plazo de 75 segundos, sin reintentos automáticos; cancelar
después de iniciar la petición no garantiza evitar un cargo del proveedor.

No se modifica la emisión fiscal ni se crean cuentas por cobrar por leer un archivo.
Antes de uso operativo, verificar modelo/saldo y exactitud con facturas autorizadas
de distintos formatos; las pruebas simuladas no certifican la API real.

### Compatibilidad con la integración anterior de OpenAI

La migración `20261012160000_manual_sari_usa_invoices.sql` ya está aplicada en
Supabase Production. No hay SQL nuevo por el cambio a lectura local.

La integración anterior sigue disponible al seleccionar `MANUAL_INVOICE_OCR_PROVIDER=openai`
(valor legacy si no se define), con `OPENAI_API_KEY` y un modelo de OpenAI.
Para usar solo el lector gratuito, establecer `MANUAL_INVOICE_OCR_ENABLED=false`.
Las claves se conservan exclusivamente en el servidor.

La prueba anterior con una factura ficticia recibió `credit_balance_exhausted`.
La alternativa local funciona independientemente de ese saldo y no consume
el cupo diario de la API OCR.

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
