import { Activity, BarChart3, FileText, Ship, Smartphone, Warehouse } from 'lucide-react'

export type OperationJourneyStage = {
  id: string
  shortLabel: string
  label: string
  decision: string
  team: string
  connectedInformation: string
  result: string
  image: string
  alt: string
}

export type TeamRole = {
  id: string
  name: string
  question: string
  receives: string
  decision: string
  result: string
}

export const productViews = [
  {
    id: 'cotizacion',
    label: 'Cotización',
    stage: 'Cotiza y decide',
    title: 'Margen visible antes de aprobar',
    description:
      'Costo, venta, profit y GP de cada cotización junto con los datos comerciales y operativos del embarque.',
    image: '/product/cotizacion-rentabilidad.webp',
    alt: 'Detalle de una cotización demo con costo, venta, profit y porcentaje de margen',
    icon: FileText,
  },
  {
    id: 'booking',
    label: 'Booking y BL',
    stage: 'Coordina y documenta',
    title: 'Documentación conectada a la operación',
    description:
      'Booking, routing, shipper, consignee, MBL y HBL permanecen vinculados al mismo expediente operativo.',
    image: '/product/booking-bl.webp',
    alt: 'Booking demo de Forwarders ERP con información de routing, MBL y HBL',
    icon: Ship,
  },
  {
    id: 'inventario',
    label: 'Bodega Miami',
    stage: 'Controla la carga',
    title: 'Inventario y estados de carga',
    description:
      'Control por tracking, warehouse, rack, peso y estado para seguir cada paquete desde Miami hasta su entrega.',
    image: '/product/inventario-miami.webp',
    alt: 'Inventario demo de bodega Miami con filtros, ubicación en rack y estado de paquetes',
    icon: Warehouse,
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    stage: 'Valida y cierra',
    title: 'Costo cotizado contra resultado real',
    description:
      'Venta, GP cotizado, GP real y pérdidas detectadas para evaluar la rentabilidad final de cada operación.',
    image: '/product/dashboard-financiero.webp',
    alt: 'Dashboard financiero demo con venta cotizada, margen bruto y pérdidas detectadas',
    icon: Activity,
  },
  {
    id: 'portal',
    label: 'Portal cliente',
    stage: 'Comparte visibilidad',
    title: 'Tracking claro para el cliente final',
    description:
      'El cliente consulta hitos, movimientos y datos de su carga desde un portal separado del ERP interno.',
    image: '/product/portal-tracking.webp',
    alt: 'Portal demo Mi Carga con seguimiento e historial de un paquete',
    icon: Smartphone,
  },
  {
    id: 'comercial',
    label: 'Comercial',
    stage: 'Revisa el panorama',
    title: 'Pipeline y rentabilidad comercial',
    description:
      'Cotizaciones creadas, enviadas, ganadas y perdidas con venta, profit y tasa de cierre en una sola vista.',
    image: '/product/dashboard-comercial.webp',
    alt: 'Dashboard comercial de Forwarders ERP con indicadores de cotizaciones, ventas y margen',
    icon: BarChart3,
  },
]

export const landingNavigation = [
  { label: 'Producto', href: '#producto' },
  { label: 'Cómo funciona', href: '#workflow' },
  { label: 'Equipos', href: '#equipos' },
  { label: 'Preguntas', href: '#preguntas' },
]

export const operationJourney: OperationJourneyStage[] = [
  {
    id: 'quote',
    shortLabel: '01',
    label: 'Cotización',
    decision: 'Definir el servicio, la ruta y la carga que se presentarán al cliente.',
    team: 'Ventas',
    connectedInformation: 'Cliente, modalidad, origen, destino, incoterm, carga y condiciones comerciales.',
    result: 'Una cotización identificada y lista para construir su pricing.',
    image: '/product/cotizacion-rentabilidad.webp',
    alt: 'Cotización demo con cliente, ruta, carga, costo, venta y margen',
  },
  {
    id: 'pricing',
    shortLabel: '02',
    label: 'Pricing y opciones',
    decision: 'Comparar tarifas de agentes y elegir la alternativa comercial que se presentará.',
    team: 'Pricing y Ventas',
    connectedInformation: 'Carrier, tránsito, transbordo, días libres, vigencia, costo, venta y margen.',
    result: 'Una opción comercial con condiciones y margen visibles antes de aprobarla.',
    image: '/product/cotizacion-rentabilidad.webp',
    alt: 'Cotización demo con venta total, costo total, profit y porcentaje de margen',
  },
  {
    id: 'shipment',
    shortLabel: '03',
    label: 'Shipment',
    decision: 'Abrir el expediente operativo a partir de la opción comercial aceptada.',
    team: 'Operaciones',
    connectedInformation: 'Cliente, routing, modalidad, carga y condiciones provenientes de la cotización.',
    result: 'Un shipment con el contexto necesario para comenzar la ejecución.',
    image: '/product/booking-bl.webp',
    alt: 'Expediente demo de booking con routing y partes vinculadas a la operación',
  },
  {
    id: 'shipping-instruction',
    shortLabel: '04',
    label: 'Shipping Instruction',
    decision: 'Confirmar las instrucciones documentales y operativas que utilizará el embarque.',
    team: 'Operaciones y Documentación',
    connectedInformation: 'Shipper, consignee, notify, routing, carga e instrucciones del expediente.',
    result: 'Una Shipping Instruction vinculada al shipment y preparada para documentar.',
    image: '/product/booking-bl.webp',
    alt: 'Pantalla demo de booking y documentos con información del embarque',
  },
  {
    id: 'booking',
    shortLabel: '05',
    label: 'Booking y documentos',
    decision: 'Coordinar la reserva y mantener MBL, HBL y routing dentro del mismo expediente.',
    team: 'Operaciones y Documentación',
    connectedInformation: 'Booking, itinerario, contenedores, MBL, HBL y partes documentales.',
    result: 'Reserva y documentos localizables desde el contexto de la operación.',
    image: '/product/booking-bl.webp',
    alt: 'Booking demo con routing, MBL, HBL y datos documentales conectados',
  },
  {
    id: 'operation',
    shortLabel: '06',
    label: 'Operación',
    decision: 'Actualizar el avance de la carga y conservar sus hitos operativos.',
    team: 'Operaciones y Bodega',
    connectedInformation: 'Tracking, warehouse, rack, peso, estado y movimientos de la carga.',
    result: 'Visibilidad operativa para el equipo y una fuente controlada para informar al cliente.',
    image: '/product/inventario-miami.webp',
    alt: 'Inventario demo de bodega con tracking, rack, peso y estado de la carga',
  },
  {
    id: 'costs',
    shortLabel: '07',
    label: 'Validación de costos',
    decision: 'Contrastar el costo cotizado con los costos registrados durante la ejecución.',
    team: 'Finanzas',
    connectedInformation: 'Costo estimado, costos registrados, documentos y referencias de la operación.',
    result: 'Diferencias identificadas antes de revisar el resultado financiero disponible.',
    image: '/product/dashboard-financiero.webp',
    alt: 'Dashboard financiero demo con validación de costos y resultado de la operación',
  },
  {
    id: 'profitability',
    shortLabel: '08',
    label: 'Factura y rentabilidad',
    decision: 'Revisar la facturación y comparar el GP cotizado con el GP real registrado.',
    team: 'Finanzas y Dirección',
    connectedInformation: 'Venta, facturación, costos validados, GP cotizado y GP real.',
    result: 'Visibilidad del margen al cierre para tomar decisiones con los costos registrados.',
    image: '/product/dashboard-financiero.webp',
    alt: 'Dashboard financiero demo con venta, GP cotizado y GP real',
  },
]

export const connectedOperationStages = [
  { id: 'quote', shortLabel: '01', label: 'Cotización', detail: 'Ruta, carga y cliente' },
  { id: 'pricing', shortLabel: '02', label: 'Pricing', detail: 'Costo, venta y margen' },
  { id: 'operation', shortLabel: '03', label: 'Operación', detail: 'Booking y documentos' },
  { id: 'profit', shortLabel: '04', label: 'Rentabilidad', detail: 'Resultado real' },
]

export const teamRoles: TeamRole[] = [
  {
    id: 'commercial',
    name: 'Ventas y Pricing',
    question: '¿Qué podemos ofrecer y con qué margen?',
    receives: 'Cliente, modalidad, ruta, carga, tarifas de agentes y condiciones.',
    decision: 'Construir y seleccionar una alternativa comercial verificable.',
    result: 'Entrega una cotización con pricing, condiciones y contexto para Operaciones.',
  },
  {
    id: 'operations',
    name: 'Operaciones y Documentación',
    question: '¿Qué debemos ejecutar y documentar?',
    receives: 'Opción aceptada, routing, partes, carga y condiciones acordadas.',
    decision: 'Coordinar shipment, Shipping Instruction, booking, BL e hitos operativos.',
    result: 'Entrega un expediente ejecutado con documentos y costos disponibles para validar.',
  },
  {
    id: 'finance',
    name: 'Finanzas y Dirección',
    question: '¿Cuál fue el resultado registrado?',
    receives: 'Venta cotizada, costos de la operación, documentos y facturación.',
    decision: 'Validar diferencias y revisar GP cotizado frente a GP real.',
    result: 'Entrega visibilidad financiera para seguimiento y toma de decisiones.',
  },
]

export const implementationSteps = [
  {
    number: '01',
    title: 'Diagnóstico operativo',
    detail: 'Mapeamos tus modalidades (FCL, LCL, aéreo, terrestre o courier), estructura de equipos y puntos de control.',
  },
  {
    number: '02',
    title: 'Configuración a medida',
    detail: 'Parametrizamos el entorno según el flujo comercial, operativo y financiero de tu agencia.',
  },
  {
    number: '03',
    title: 'Migración de catálogos',
    detail: 'Estructuramos e importamos tus catálogos de clientes, agentes y tarifarios para que no arranques desde cero.',
  },
  {
    number: '04',
    title: 'Entrenamiento por rol',
    detail: 'Capacitamos de forma práctica a Ventas, Pricing, Operaciones y Finanzas en sus flujos diarios.',
  },
  {
    number: '05',
    title: 'Salida en vivo acompañada',
    detail: 'Acompañamos a tu equipo en las primeras operaciones reales para asegurar una transición ordenada.',
  },
]

export const productEvidence = [
  {
    title: '100% Producto real',
    detail: 'Seis vistas interactivas del sistema en producción, sin maquetas ni diseños conceptuales.',
  },
  {
    title: 'Flujo freight de punta a punta',
    detail: 'Cotización, pricing, booking, bodega, documentos y finanzas en un mismo expediente.',
  },
  {
    title: 'Rentabilidad bajo control',
    detail: 'Comparación transparente entre el GP cotizado por ventas y el GP real al cierre operativo.',
  },
]

export const landingQuestions = [
  {
    question: '¿Para qué tipo de operación está pensado?',
    answer:
      'Para freight forwarders, NVOCC y agencias de carga que coordinan embarques marítimos (FCL/LCL), aéreos, terrestres o courier. Conecta en un solo flujo a los equipos de ventas, pricing, operaciones, bodega Miami y finanzas.',
  },
  {
    question: '¿Cómo funciona el proceso de implementación?',
    answer:
      'Iniciamos con una sesión de diagnóstico en tu demo para entender las modalidades que operas y el tamaño de tu equipo. Con base en eso, definimos un plan de configuración y puesta en marcha adaptado a tu operación.',
  },
  {
    question: '¿Qué pasa con mis datos actuales en Excel?',
    answer:
      'No tienes que empezar desde cero. Durante la implementación revisamos tus archivos actuales para ayudarte a estructurar y migrar tus catálogos de clientes, proveedores, rutas y tarifas activas.',
  },
  {
    question: '¿Mis clientes pueden consultar el estatus de su carga?',
    answer:
      'Sí. Cuentas con un portal de clientes independiente del ERP interno donde tus clientes consultan hitos, tracking y movimientos autorizados por tu equipo operativo, sin exponer costos ni información sensible.',
  },
  {
    question: '¿Cómo funciona el soporte técnico y acompañamiento?',
    answer:
      'Incluimos mesa de ayuda integrada para seguimiento de tickets y acompañamiento directo durante tu adopción. Los niveles de servicio (SLA) y canales de atención quedan respaldados desde tu propuesta comercial.',
  },
  {
    question: '¿Cómo se estructura el precio de la plataforma?',
    answer:
      'El licenciamiento se adapta al volumen y alcance operativo de tu agencia. Agenda una demo para evaluar tu flujo y entregarte una propuesta comercial transparente con costos de implementación y suscripción.',
  },
]
