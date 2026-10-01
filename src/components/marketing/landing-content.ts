import { Activity, BarChart3, FileText, Ship, Smartphone, Warehouse } from 'lucide-react'

export const productViews = [
  {
    id: 'comercial',
    label: 'Comercial',
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
