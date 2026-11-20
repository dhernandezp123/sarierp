# Continuación de Recursos Humanos

Actualización: 20/11/2026. Usuario autorizó continuar las fases. Confirmó correo y firma manual con carga privada; necesita las capacidades de nómina consultadas, pero no tiene reglas internas documentadas. La política inicial se registra en [nómina](hr-payroll-policy.md), con configuración y revisión obligatorias.

## Fase 1 — Cierre de empleados, permisos y vacaciones

Cerrada localmente en `45e393b`: 683 pruebas Node, 65 grupos API, 31 de navegador y conciliación de 35 períodos. Incluye recuperación explícita del cálculo previo sin volver a editar fechas ni cambiar el identificador del reintento. [Evidencia](uat/hr-release-validation-2026-11-20.json).

## Fase 2 — Integración y publicación

En curso. Candidato aislado `release/hr-module-20261120`; no contiene los cambios locales ajenos a HR del árbol principal. El preflight inicial encontró Production sin HR, con migración máxima `20261118130000`; el preflight final detectó compras `20261120140000`. Integrar ese cambio y revisar el head remoto y el despliegue actual antes de publicar.

Se verificaron por separado respaldos BD, Storage y salud; el último restore disponible es histórico y no se hizo uno nuevo. Los seis archivos HR previstos tienen versiones propias y se preparan en una transacción con guardias. [Runbook](hr-release-runbook.md). SQL de HR y despliegue aún pendientes; no declarar cierre remoto basándose en UAT local.

## Fase 3 — Calendario, avisos y trazabilidad

Implementada y validada localmente: calendario aprobado por alcance, historial de ficha, Excel/CSV completos y avisos internos transaccionales. Correo mínimo con enlace al portal, destinatario autorizado, cola idempotente, control por empresa, bloqueo Demo y cron. La recepción efectiva en buzón se verifica con el primer uso autorizado; no se enviaron mensajes de prueba a personal real.

## Fase 4 — Documentos y constancias

Implementada y validada localmente: snapshots de concesión/acumulación/suspensión, PDF, firma manual y carga privada Admin con historial de versiones. Reintentos después de perder la respuesta no duplican el documento. Auth, PostgREST y Storage reales locales; aislamiento por tenant, hashes, permisos y descarga privada comprobados. PDF inspeccionado visualmente.

## Fase 5 — Nómina y liquidaciones

Circuito configurable implementado y validado localmente: contratos por vigencia, HNL/USD, cuatro frecuencias, fijo/variable/mixto, conceptos y cuentas, soporte de importes revisados, borrador, aprobación, contabilización/reversión y comprobantes propios privados. Vacaciones pagadas requieren solicitud aprobada y anticipo de tres días; liquidación requiere causal. No añade salario fijo por duplicado en vacaciones/liquidación ni ejecuta transferencias.

No se inventan contratos, salarios, tasas legales, exclusiones, prestaciones ni cuentas. La primera versión captura retenciones y prestaciones calculadas y revisadas por su responsable; no implementa un motor automático de cumplimiento legal ni dispersión bancaria. Completar configuración real y conciliar la primera nómina son pasos operativos pendientes. No se presenta la respuesta “aplican todas” como una regla matemática concreta ni como autorización para inventar importes.

## Validación consolidada y límites

[Evidencia de fases 3–5](uat/hr-phases-3-5-validation-2026-11-20.json): 690 pruebas Node antes de integrar compras, seis suites SQL en rollback, TypeScript/ESLint, estándar financiero, build/postbuild OCR, API/HTTP autenticados y navegador a 1280/768/390. Incluye corrección de altura de modales, recuperación de respuesta perdida en nómina y carga firmada, privacidad salarial y cierre de formulario tras logout en otra pestaña.

Los resultados locales no acreditan publicación, UAT autenticada de Production, recepción de correo ni uso en un iPad/Safari físico. Mantener esos estados por separado en el runbook y el registro de release. El `.next` local usa configuración UAT; Production se reconstruye desde fuente con sus variables propias. `.env.local` no se modificó.