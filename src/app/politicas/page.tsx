import Link from 'next/link'
import { Globe2, ArrowLeft, Mail } from 'lucide-react'

export const metadata = {
  title: 'Términos de Uso y Privacidad — Forwarders ERP by DHer',
  description: 'Términos de uso, aviso de privacidad y condiciones del sistema logístico Forwarders ERP.',
}

const sections = [
  {
    id: 'alcance',
    title: 'Alcance, proveedor y aceptación',
    body: `Forwarders ERP by DHer ("el Sistema") es un servicio empresarial de software. El proveedor contractual será la persona natural o jurídica identificada como DHer en la propuesta, orden de servicio o contrato suscrito con la organización contratante. Dicho documento deberá contener su denominación legal, identificación tributaria, domicilio y datos de contacto.

El uso del Sistema implica la aceptación de estos Términos por parte del usuario y de la organización que representa. La organización declara que quien contrata o administra el servicio cuenta con facultades suficientes para obligarla. Si no está de acuerdo, deberá abstenerse de utilizarlo.

La orden de servicio, el contrato, el acuerdo de nivel de servicio (SLA) y el acuerdo de tratamiento de datos, si existen, prevalecen sobre esta página en caso de contradicción. Esta página no sustituye esos instrumentos.

Estas políticas aplican a todos los usuarios registrados, sin importar el rol asignado: Administrador, Ventas, Pricing, Operaciones, Finanzas, Contabilidad o Cliente.`,
  },
  {
    id: 'acceso',
    title: 'Acceso y credenciales',
    body: `Cada usuario recibe credenciales de acceso personales e intransferibles. El usuario es responsable de:

• Mantener la confidencialidad de su contraseña.
• No compartir su sesión con terceros.
• Notificar de inmediato al administrador del sistema ante cualquier uso no autorizado de su cuenta.
• Cerrar sesión al finalizar cada jornada de trabajo.

El acceso otorgado corresponde exclusivamente al rol y permisos definidos por el administrador de la organización. Cualquier intento de acceder a módulos o funcionalidades fuera del alcance del rol asignado está prohibido.`,
  },
  {
    id: 'uso-permitido',
    title: 'Uso permitido',
    body: `El Sistema está diseñado exclusivamente para la gestión operativa y comercial de empresas de carga internacional, freight forwarding y logística. Los usos permitidos incluyen:

• Registro y seguimiento de cotizaciones, embarques y documentos.
• Gestión de clientes, proveedores y agentes de carga.
• Emisión de documentos de transporte: HBL, AWB, Carta Porte.
• Control de facturación, cuentas por cobrar y cuentas por pagar.
• Operaciones de bodega y consolidación de carga.
• Generación de reportes financieros y operativos.

Queda expresamente prohibido utilizar el Sistema para fines distintos a los señalados, incluyendo actividades ilícitas o que contravengan la legislación hondureña o centroamericana aplicable.`,
  },
  {
    id: 'usos-prohibidos',
    title: 'Usos prohibidos',
    body: `Está terminantemente prohibido:

• Manipular, alterar o eliminar registros históricos con el propósito de ocultar información operativa o financiera.
• Introducir información falsa, incompleta o engañosa en cualquier módulo del Sistema.
• Intentar acceder, descifrar o explotar vulnerabilidades de seguridad del Sistema.
• Realizar ingeniería inversa, descompilar o copiar el código fuente de la plataforma.
• Compartir acceso con personas no autorizadas por la organización.
• Usar el Sistema para extraer datos de clientes o proveedores con fines comerciales no autorizados.
• Automatizar consultas o accesos masivos sin autorización expresa del proveedor.

El incumplimiento de estas restricciones podrá resultar en la suspensión inmediata del acceso y, de corresponder, en acciones legales.`,
  },
  {
    id: 'datos',
    title: 'Propiedad, licencia y gestión de los datos',
    body: `La organización contratante conserva sus derechos sobre los datos operativos ingresados al Sistema: clientes, contactos, cotizaciones, embarques, documentos, facturas y archivos. La organización concede a DHer una autorización limitada, no exclusiva y temporal para alojar, respaldar, transmitir y procesar esos datos únicamente con el fin de prestar, proteger y mantener el servicio.

DHer no adquiere derecho de comercialización sobre los datos de la organización. Los datos agregados o anonimizados solo podrán utilizarse para seguridad, métricas y mejora del servicio cuando no permitan identificar a una persona, cliente u operación.

La organización contratante es responsable de:

• La exactitud e integridad de la información ingresada.
• El cumplimiento de las obligaciones fiscales y legales derivadas de los datos registrados.
• La gestión de los accesos y roles de sus usuarios.

DHer aplica medidas técnicas y organizativas razonables según el riesgo, incluyendo cifrado en tránsito, controles de acceso por rol, segregación lógica y mecanismos de registro disponibles. Ningún sistema es absolutamente seguro; las medidas específicas, respaldos, objetivos de recuperación y retención se definirán en el contrato o SLA vigente.`,
  },
  {
    id: 'privacidad',
    title: 'Aviso de privacidad y categorías de datos',
    body: `El Sistema puede tratar datos de usuarios, clientes, contactos, proveedores, transportistas y consignatarios, entre ellos: nombre, correo, teléfono, dirección, identificación fiscal, rol, credenciales técnicas, direcciones IP, registros de acceso, comunicaciones, documentos de transporte, fotografías, datos de facturación y detalles vinculados con una operación logística.

La organización contratante determina los fines de los datos personales que carga y actúa como responsable frente a sus titulares. DHer los procesa como proveedor o encargado para prestar soporte, autenticación, alojamiento, seguridad, respaldo, continuidad, prevención de fraude, cumplimiento legal y mejora técnica del servicio.

La organización garantiza que cuenta con una base legítima para recopilar y cargar los datos, que ha informado a sus titulares y que no ingresará datos excesivos, ilícitos o ajenos a la operación. Las solicitudes de acceso, corrección, actualización, eliminación, oposición o portabilidad se atenderán conforme a la ley aplicable y a las obligaciones de conservación fiscal, contractual y de seguridad.`,
  },
  {
    id: 'proveedores-transferencias',
    title: 'Proveedores tecnológicos y transferencias',
    body: `Para operar el Sistema pueden utilizarse proveedores de infraestructura, base de datos, autenticación, almacenamiento, correo, monitoreo y despliegue, incluidos Supabase y Vercel u otros equivalentes. Estos proveedores procesan información bajo sus propios compromisos de seguridad y privacidad.

Los datos pueden alojarse o procesarse fuera de Honduras. DHer procurará que los proveedores ofrezcan salvaguardas contractuales y técnicas razonables. La lista vigente de subprocesadores y las regiones de alojamiento deberán estar disponibles para la organización contratante a solicitud o en el acuerdo de tratamiento de datos.

DHer podrá revelar información cuando exista obligación legal, orden de autoridad competente o necesidad razonable de proteger la seguridad e integridad del servicio, informando a la organización cuando la ley lo permita.`,
  },
  {
    id: 'cookies',
    title: 'Cookies y almacenamiento técnico',
    body: `El Sistema utiliza cookies o almacenamiento local estrictamente necesarios para autenticación, seguridad, preferencias de interfaz y continuidad de sesión. No se utilizarán cookies publicitarias ni analítica no esencial sin informar y, cuando corresponda, obtener consentimiento.

Bloquear el almacenamiento técnico esencial puede impedir el inicio de sesión o el funcionamiento correcto de la plataforma.`,
  },
  {
    id: 'retencion',
    title: 'Retención, exportación y eliminación',
    body: `Los datos se conservarán durante la vigencia del servicio y posteriormente por los períodos definidos en el contrato, las obligaciones legales aplicables, la resolución de controversias y los ciclos razonables de respaldo.

Antes de terminar el servicio, la organización podrá solicitar una exportación en un formato técnicamente disponible. Finalizado el plazo de transición contractual, DHer eliminará o anonimizará los datos bajo su control, salvo aquellos que deban conservarse por obligación legal o respaldo pendiente de rotación. Los plazos, formato, costo y asistencia de migración deberán constar en la orden de servicio o acuerdo de tratamiento de datos.`,
  },
  {
    id: 'roles',
    title: 'Roles y responsabilidades',
    body: `El Sistema opera bajo un modelo de control de acceso basado en roles (RBAC). Cada rol tiene permisos específicos:

• Administrador: acceso total. Responsable de gestionar usuarios, configuración y datos maestros.
• Ventas: gestión de cotizaciones y clientes. No puede modificar tarifas aprobadas ni datos financieros.
• Pricing: gestión de tarifas y comparativos de agentes. No puede aprobar operaciones.
• Operaciones: gestión de shipping instructions, bookings y documentos de transporte.
• Finanzas / Contabilidad: acceso a facturación, cuentas por cobrar, cuentas por pagar y reportes.
• Cliente: acceso exclusivo al portal de seguimiento de paquetes y documentos propios.

Ningún usuario puede actuar fuera de los permisos de su rol. El administrador es responsable de asignar roles acordes a las funciones reales de cada persona.`,
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad, soporte y seguridad',
    body: `La disponibilidad, horarios de soporte, mantenimiento, objetivos de recuperación y tiempos de respuesta serán los establecidos en el plan contratado o SLA. Si no existe un SLA firmado, el servicio se presta bajo esfuerzos comercialmente razonables, sin garantía de disponibilidad ininterrumpida.

Los mantenimientos programados se comunicarán con antelación razonable cuando sea posible. Los incidentes de seguridad que afecten datos de la organización se comunicarán sin demora indebida, conforme al contrato y a la ley aplicable.

No se garantiza disponibilidad continua en casos de:

• Fuerza mayor o causas fuera del control de DHer.
• Fallas en servicios de infraestructura de terceros (Supabase, Vercel u otros proveedores).
• Incidentes de seguridad que requieran intervención inmediata.

En caso de interrupción no programada, DHer comunicará la información disponible por los canales acordados, sin que una estimación inicial constituya garantía de restablecimiento.`,
  },
  {
    id: 'documentos-logisticos',
    title: 'Documentos logísticos y carga',
    body: `El Sistema facilita la preparación de HBL, AWB, cartas porte, shipping instructions, bookings, manifiestos y reportes. No actúa como transportista, agente aduanero, aseguradora, autoridad portuaria ni sustituto del documento oficial emitido por el carrier o la autoridad competente.

La organización debe revisar y autorizar cada documento antes de emitirlo o enviarlo. Es responsable de pesos, medidas, clasificación, valor, mercancías peligrosas o restringidas, licencias, sanciones, controles de exportación, origen, destino y declaraciones aduaneras.

DHer no controla pérdidas, daños, demoras, almacenajes, demurrage, detention, inspecciones, rechazos, actos del carrier ni eventos propios del transporte. Las responsabilidades por la carga se rigen por los contratos de transporte y la normativa aplicable.`,
  },
  {
    id: 'documentos-fiscales',
    title: 'Documentos fiscales y responsabilidad tributaria',
    body: `Los documentos generados por el Sistema (facturas, notas de crédito, notas de débito, proformas) son responsabilidad de la organización contratante en cuanto a su correcta emisión, numeración y cumplimiento ante el Servicio de Administración de Rentas (SAR) de Honduras.

El Sistema provee herramientas para facilitar el cumplimiento fiscal (cálculo de ISV, generación de documentos con número correlativo), pero no reemplaza la responsabilidad del contador o representante legal de la organización ante las autoridades tributarias.

DHer no presta asesoría tributaria, contable o legal y no garantiza que una configuración sea suficiente para cada operación. La organización debe validar rangos CAI, correlativos, tasas, exoneraciones, retenciones, cierres y conservación documental con su profesional responsable.`,
  },
  {
    id: 'propiedad-intelectual',
    title: 'Propiedad intelectual',
    body: `DHer conserva los derechos sobre el software, diseño, documentación, marcas, componentes, mejoras y código del Sistema. La contratación concede únicamente un derecho limitado, revocable, no transferible y no sublicenciable de uso durante la vigencia del servicio.

La organización no podrá copiar, revender, sublicenciar, descompilar, intentar obtener el código fuente ni crear un servicio competidor a partir del Sistema, salvo lo que una norma imperativa permita. Los comentarios o sugerencias podrán utilizarse para mejorar el producto sin revelar información confidencial.`,
  },
  {
    id: 'confidencialidad',
    title: 'Confidencialidad',
    body: `Cada parte protegerá la información confidencial de la otra con un grado de cuidado razonable y la usará solo para ejecutar la relación contractual. No se considera confidencial la información pública, obtenida legítimamente de un tercero, desarrollada de forma independiente o cuya divulgación sea exigida por autoridad competente.

El personal y los proveedores que requieran acceso estarán sujetos a deberes de confidencialidad acordes con su función. Las obligaciones específicas y su duración podrán ampliarse mediante contrato o acuerdo de confidencialidad.`,
  },
  {
    id: 'responsabilidad',
    title: 'Garantías y limitación de responsabilidad',
    body: `El Sistema es una herramienta de apoyo y sus resultados dependen de los datos, reglas y decisiones de la organización. Salvo garantías expresas del contrato y aquellas que legalmente no puedan excluirse, se presta sin garantías implícitas de idoneidad para una operación particular.

La asignación de riesgos, exclusiones y límite económico de responsabilidad se establecerán en el contrato. Ninguna cláusula pretende excluir responsabilidad que no pueda limitarse legalmente, incluyendo fraude, dolo o culpa grave cuando corresponda.

La organización será responsable por el uso indebido de sus cuentas, por instrucciones autorizadas desde ellas y por reclamaciones derivadas de datos o documentos que haya cargado, salvo que resulten directamente de un incumplimiento atribuible a DHer.`,
  },
  {
    id: 'suspension-terminacion',
    title: 'Suspensión y terminación',
    body: `DHer podrá suspender temporalmente el acceso por riesgo de seguridad, uso ilícito, incumplimiento material, mora conforme al contrato o requerimiento de autoridad. Cuando sea razonablemente posible, notificará y permitirá subsanar antes de la suspensión.

La terminación, preavisos, pagos pendientes, asistencia de salida y acceso a exportaciones se regirán por la orden de servicio. La terminación no elimina obligaciones devengadas, confidencialidad, propiedad intelectual ni aquellas que por su naturaleza deban sobrevivir.`,
  },
  {
    id: 'pruebas',
    title: 'Ambientes de prueba y demostración',
    body: `Las cuentas de demostración o prueba tienen duración, capacidad y funcionalidades limitadas; pueden suspenderse o expirar automáticamente y no incluyen SLA salvo pacto escrito. No deben utilizarse para operaciones reales, documentos fiscales válidos, datos personales sensibles ni información confidencial de clientes.

Los datos ficticios del ambiente de prueba podrán reiniciarse o eliminarse al finalizar el período. La conversión a un plan contratado y cualquier migración de datos deberán confirmarse por escrito.`,
  },
  {
    id: 'ley-aplicable',
    title: 'Ley aplicable y controversias',
    body: `La relación se regirá por las leyes de la República de Honduras, sin perjuicio de normas imperativas aplicables en otros territorios. Las partes procurarán resolver de buena fe cualquier controversia mediante negociación y escalamiento entre representantes autorizados.

El tribunal competente, arbitraje, ciudad, idioma y distribución de costos deberán quedar definidos en el contrato u orden de servicio. Nada en esta sección limita el derecho de acudir a una autoridad cuando una norma imperativa lo reconozca.`,
  },
  {
    id: 'modificaciones',
    title: 'Modificaciones a las políticas',
    body: `DHer podrá actualizar estos Términos por cambios legales, de seguridad, técnicos o del servicio. Los cambios materiales se comunicarán al administrador por el sistema o correo con antelación razonable; los cambios urgentes de seguridad o cumplimiento podrán tener efecto inmediato cuando sea necesario.

Cada versión indicará fecha de vigencia. Cuando el cambio altere materialmente derechos u obligaciones, podrá requerirse aceptación expresa. La versión aplicable a un contrato no modificará unilateralmente condiciones comerciales pactadas que exijan acuerdo de ambas partes.`,
  },
  {
    id: 'contacto',
    title: 'Contacto y soporte',
    body: `Para consultas sobre estas políticas, reportes de incidentes de seguridad o solicitudes relacionadas con la privacidad de datos, comunicarse a:

Correo contractual y privacidad: contacto@dher.dev
Sitio web: forwarderserp.com

DHer acusará recibo y atenderá la solicitud en un plazo razonable según su naturaleza, la ley aplicable y el SLA contratado. Para proteger los datos, podrá solicitar verificación de identidad y canalizar solicitudes de titulares a través de la organización responsable.`,
  },
]

function SectionBody({ body }: { body: string }) {
  const blocks = body.split('\n\n')
  return (
    <div className="space-y-3.5">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const hasBullets = lines.some((l) => l.startsWith('•'))

        if (hasBullets) {
          return (
            <ul key={i} className="space-y-2">
              {lines.map((line, j) =>
                line.startsWith('•') ? (
                  <li key={j} className="flex items-start gap-3">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#EF8E01]" />
                    <span className="text-sm leading-relaxed text-slate-600 text-justify hyphens-auto">
                      {line.replace(/^•\s*/, '')}
                    </span>
                  </li>
                ) : (
                  <p key={j} className="text-sm leading-relaxed text-slate-600 text-justify hyphens-auto">
                    {line}
                  </p>
                )
              )}
            </ul>
          )
        }

        return (
          <p key={i} className="text-sm leading-relaxed text-slate-600 text-justify hyphens-auto">
            {block}
          </p>
        )
      })}
    </div>
  )
}

export default function PoliticasPage() {
  return (
    <main className="min-h-screen bg-[#F7F8FA] text-[#07111F]">

      {/* Nav */}
      <nav className="sticky top-0 z-20 border-b border-white/8 bg-[#07111F]/96 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EF8E01] text-white shadow-sm">
              <Globe2 size={15} />
            </span>
            <span className="text-sm font-bold text-white">Forwarders ERP</span>
            <span className="hidden text-[11px] text-slate-500 sm:block">by DHer</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft size={12} />
            Volver al inicio
          </Link>
        </div>
      </nav>

      {/* Hero — dark */}
      <header className="relative isolate overflow-hidden bg-[#07111F] px-5 py-16 sm:px-8 sm:py-20">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[#EF8E01]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#0038BD]/15 blur-3xl" />
        {/* Grid */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,white,transparent_78%)]" />

        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#EF8E01]/25 bg-[#EF8E01]/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#EF8E01]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#EF8E01]">
              Forwarders ERP by DHer
            </span>
          </div>

          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Términos de Uso y Aviso de Privacidad
          </h1>

          <p className="mt-3 text-base text-slate-400">
            Versión 1.0 &mdash; Vigente desde el 22 de junio de 2026
          </p>

          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-400 text-justify hyphens-auto">
            Estos términos establecen las condiciones de uso, responsabilidades y compromisos
            entre DHer y las organizaciones que utilizan la plataforma Forwarders ERP para
            gestionar sus operaciones de carga internacional. Deben leerse junto con la orden
            de servicio, el SLA y el acuerdo de tratamiento de datos aplicables.
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[224px_1fr] lg:items-start">

          {/* Índice lateral */}
          <aside className="hidden lg:block">
            <div className="sticky top-[72px] max-h-[calc(100vh-96px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-[#07111F] px-5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#EF8E01]">
                  Contenido
                </p>
              </div>
              <nav className="p-2.5">
                {sections.map((s, i) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="group flex items-center gap-2.5 rounded-xl px-3 py-2 transition hover:bg-[#0038BD]/5"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500 transition group-hover:bg-[#0038BD]/10 group-hover:text-[#0038BD]">
                      {i + 1}
                    </span>
                    <span className="text-[11px] font-medium leading-tight text-slate-500 transition group-hover:text-[#0038BD]">
                      {s.title}
                    </span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Secciones */}
          <div className="space-y-5">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                className="group relative overflow-hidden scroll-mt-[80px] rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg hover:shadow-[#0038BD]/5"
              >
                {/* Gradient bar — animada on hover */}
                <div className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-[#0038BD] to-[#EF8E01] transition-transform duration-500 group-hover:scale-x-100" />

                <div className="p-6 sm:p-8">
                  {/* Número + título */}
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0038BD]/8 text-[11px] font-bold text-[#0038BD]">
                      {i + 1}
                    </span>
                    <h2 className="text-base font-bold leading-snug text-[#07111F]">
                      {s.title}
                    </h2>
                  </div>

                  {/* Divisor */}
                  <div className="my-4 h-px bg-gradient-to-r from-slate-100 via-slate-200 to-transparent" />

                  {/* Contenido */}
                  <SectionBody body={s.body} />
                </div>
              </section>
            ))}

            {/* CTA contacto */}
            <div className="relative overflow-hidden rounded-2xl bg-[#07111F] p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#EF8E01]/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-[#0038BD]/20 blur-3xl" />
              <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#EF8E01]">
                    Soporte
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-white">
                    ¿Tienes preguntas sobre estas políticas?
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    DHer responde en un máximo de 3 días hábiles.
                  </p>
                </div>
                <a
                  href="mailto:contacto@dher.dev"
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#EF8E01] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#EF8E01]/20 transition hover:bg-[#db8000]"
                >
                  <Mail size={15} />
                  contacto@dher.dev
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/8 bg-[#07111F] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#EF8E01]/15">
              <Globe2 size={12} className="text-[#EF8E01]" />
            </span>
            <p className="text-xs text-slate-500">
              &copy; 2026 Forwarders ERP by DHer. Todos los derechos reservados.
            </p>
          </div>
          <p className="text-xs text-slate-600">Honduras &amp; Centroam&eacute;rica</p>
        </div>
      </footer>

    </main>
  )
}
