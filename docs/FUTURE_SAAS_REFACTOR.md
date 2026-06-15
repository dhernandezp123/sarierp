# FUTURE_SAAS_REFACTOR.md

## Objetivo

Convertir Sari ERP de una solución específica para Sari Express a una plataforma SaaS multiempresa para Freight Forwarders.

---

# Estado Actual

Actualmente el sistema está optimizado para los procesos de Sari Express.

Estimación:

* 70% Sari Express
* 30% SaaS Ready

Esto es aceptable para la etapa actual del proyecto.

La prioridad sigue siendo terminar el flujo operativo completo antes de ejecutar grandes refactorizaciones.

---

# Épicas de Refactorización SaaS

## 1. Multi-Tenant Foundation

Prioridad: Alta

### Objetivo

Permitir múltiples empresas usando una misma plataforma.

### Cambios

Agregar tenant_id a:

* profiles
* clientes
* quotations
* quotation_containers
* quotation_cargo_lines
* pricing_items
* agent_quotes
* shipments
* bookings
* activity_logs
* client_rates

Implementar RLS por tenant.

---

## 2. Catálogo Dinámico de Cargos

Prioridad: Alta

### Problema Actual

Los cargos especiales están hardcodeados.

Ejemplos:

* fumigacion
* embalaje_madera
* bonded_documentacion_7512
* declaracion_imo

### Objetivo

Permitir que cada empresa configure sus propios cargos.

### Nueva Tabla

charge_catalog

Campos sugeridos:

* id
* tenant_id
* code
* name
* item_type
* taxable
* active

Ejemplos:

* AMS Fee
* ENS Filing
* Chassis Split
* Peak Season Surcharge
* Bonded 7512
* Embalaje Madera

### Resultado

Eliminar listas hardcodeadas como:

optionalClientRateCodes

---

## 3. Workflows Configurables

Prioridad: Media

### Problema Actual

Estados definidos por Sari Express.

### Objetivo

Permitir estados personalizados por empresa.

Ejemplo:

Empresa A:

* Pendiente Pricing
* Cotizada
* Ganada

Empresa B:

* Draft
* Quoted
* Awarded

---

## 4. Branding por Empresa

Prioridad: Alta

### Objetivo

Cada empresa debe tener:

* Logo
* Colores
* Datos fiscales
* Dirección
* RTN/NIT
* Footer PDF

### PDF

Los PDFs deben leer branding desde tenant_settings.

---

## 5. PDFs Configurables

Prioridad: Media

### Objetivo

Permitir:

* Plantillas PDF distintas
* Términos y condiciones distintos
* Observaciones por empresa

---

## 6. Catálogo Dinámico de Productos de Servicio

Prioridad: Alta

### Problema Actual

service_product contiene lógica específica.

Ejemplos:

* miami_lcl
* miami_air

### Objetivo

Permitir que cada empresa configure:

* Courier
* China LCL
* Miami Air
* Panamá Consol
* Inland USA

sin modificar código.

---

## 7. Catálogo Dinámico de Incoterms Extendidos

Prioridad: Baja

Permitir reglas configurables por Incoterm.

---

## 8. Reglas de Pricing Configurables

Prioridad: Media

### Objetivo

Eliminar fórmulas hardcodeadas.

Ejemplos:

* Miami LCL
* Miami Air

Cada tenant podrá definir reglas propias.

---

## 9. Dashboard Configurable

Prioridad: Baja

Cada empresa define:

* KPIs
* Métricas
* Widgets

---

## 10. Marketplace de Integraciones

Prioridad: Futura

Integraciones potenciales:

* CargoWise
* Magaya
* SAP
* QuickBooks
* Xero
* DHL
* FedEx
* UPS

---


# PDF Terms & Conditions Templates

Cada empresa podrá configurar:
- Términos generales
- Términos marítimos
- Términos aéreos
- Términos courier
- Cláusula de seguro
- Cláusula de inspecciones
- Cláusula legal

# No Refactorizar Todavía

Mientras no esté completo:

* Shipping Instructions
* Bookings
* Operaciones
* Tracking
* Facturación

No ejecutar refactorizaciones masivas.

La prioridad actual es terminar el ERP funcional para Sari Express.

---

# FUTURE SAAS REFACTOR

## Refactor pendiente: Producto Comercial como driver principal

Estado: Post-MVP

Motivo:
Actualmente existen dos campos que representan la misma decisión:

- Producto Comercial
- Tipo de Cotización

Esto genera redundancia y riesgo de inconsistencias.

Objetivo futuro:
Que Producto Comercial determine automáticamente:

- Transporte
- Tipo de Cotización
- Reglas de validación
- Flujo de carga
- Requerimientos de Pricing

Impacto:
Medio

Riesgo:
Medio-Alto

Prioridad:
Después de estabilizar MVP y antes de Multi-Tenant SaaS.

# BLOCKERS PARA SAAS

## Críticos

- Multi tenant
- Catálogos configurables
- Numeración por empresa
- Branding por empresa
- Templates PDF por empresa

## Altos

- Producto Comercial como driver principal
- Workflow configurable
- Campos configurables por flujo

## Medios

- Dashboard configurable
- Notificaciones configurables
- Automatizaciones

# Meta Final

Convertir Sari ERP en:

"ERP SaaS para Freight Forwarders de Centroamérica"

capaz de soportar múltiples empresas utilizando una sola base de código.
