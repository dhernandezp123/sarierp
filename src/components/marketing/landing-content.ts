import { Activity, BarChart3, FileText, Ship, Smartphone, Warehouse } from 'lucide-react'

export const productViews = [
  {
    id: 'comercial',
    label: 'Comercial',
    stage: 'Control comercial',
    title: 'Pipeline y rentabilidad comercial',
    description:
      'Cotizaciones creadas, enviadas, ganadas y perdidas con venta, profit y tasa de cierre en una sola vista.',
    image: '/product/dashboard-comercial.webp',
    alt: 'Dashboard comercial de Forwarders ERP con indicadores de cotizaciones, ventas y margen',
    icon: BarChart3,
  },
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
]

export const landingNavigation = [
  { label: 'Producto', href: '#producto' },
  { label: 'Cómo funciona', href: '#workflow' },
  { label: 'Equipos', href: '#equipos' },
  { label: 'Preguntas', href: '#preguntas' },
]

export const operationLifecycle = [
  { id: 'quote', shortLabel: '01', label: 'Cotización', detail: 'Cliente, ruta y carga' },
  { id: 'pricing', shortLabel: '02', label: 'Pricing', detail: 'Agentes, costo y venta' },
  { id: 'approval', shortLabel: '03', label: 'Opción aceptada', detail: 'Condiciones acordadas' },
  { id: 'shipment', shortLabel: '04', label: 'Shipment + SI', detail: 'Expediente operativo' },
  { id: 'booking', shortLabel: '05', label: 'Booking + BL', detail: 'Coordinación y documentos' },
  { id: 'finance', shortLabel: '06', label: 'Costos + factura', detail: 'Validación financiera' },
  { id: 'result', shortLabel: '07', label: 'Resultado', detail: 'GP cotizado y real' },
]

export const connectedOperationStages = [
  { id: 'quote', shortLabel: '01', label: 'Cotización', detail: 'Ruta, carga y cliente' },
  { id: 'pricing', shortLabel: '02', label: 'Pricing', detail: 'Costo, venta y margen' },
  { id: 'operation', shortLabel: '03', label: 'Operación', detail: 'Booking y documentos' },
  { id: 'profit', shortLabel: '04', label: 'Rentabilidad', detail: 'Resultado real' },
]

export const productEvidence = [
  {
    title: 'Producto real',
    detail: 'Seis vistas del sistema disponibles para explorar y ampliar.',
  },
  {
    title: 'Flujo freight completo',
    detail: 'Cotización, pricing, operación, documentos y finanzas conectados.',
  },
  {
    title: 'Demostración transparente',
    detail: 'Capturas del ambiente Demo con datos ficticios identificados.',
  },
]

export const landingQuestions = [
  {
    question: '¿Para qué tipo de operación está pensado?',
    answer:
      'Para freight forwarders y empresas de carga que coordinan servicios marítimos FCL/LCL, aéreos, terrestres o courier. Incluye flujos de cotización y pricing, operaciones, bodega Miami y control financiero.',
  },
  {
    question: '¿Cómo puedo evaluar la implementación?',
    answer:
      'Solicita una demo para revisar los servicios que manejas, los equipos que participan y el recorrido de una operación. La configuración, los datos iniciales y el alcance de la puesta en marcha deben definirse con tu empresa.',
  },
  {
    question: '¿Qué pasa con mis datos de Excel?',
    answer:
      'Antes de definir una migración, hay que revisar el formato y la calidad de tus catálogos, tarifas y datos históricos. Cuéntanos qué información necesitas trasladar al solicitar la demo para evaluar su alcance.',
  },
  {
    question: '¿Mis clientes pueden consultar su carga?',
    answer:
      'Sí. El portal del cliente permite consultar el estado de su carga, movimientos y notificaciones con un acceso separado del ERP interno. La información disponible corresponde a los registros y actualizaciones de la operación.',
  },
  {
    question: '¿Cómo funciona el soporte?',
    answer:
      'El ERP cuenta con una mesa de ayuda para registrar incidencias y dar seguimiento a las respuestas. Los canales, horarios y tiempos de atención se establecen en las condiciones del servicio contratado.',
  },
  {
    question: '¿Dónde consulto el precio y las condiciones?',
    answer:
      'Solicita una propuesta para revisar el alcance que necesita tu empresa. Confirma las condiciones comerciales, la puesta en marcha y el soporte antes de contratar.',
  },
]
