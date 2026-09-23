-- Fase 7: el esquema local creado solo con migraciones puede no tener la fila
-- histórica de company_settings. Se crea únicamente cuando Sari no tiene una.

insert into public.company_settings (
  tenant_id,
  legal_name,
  trade_name,
  country,
  logo_url,
  primary_color,
  secondary_color
)
select
  tenant.id,
  'SARI EXPRESS S DE R.L. DE C.V.',
  'Sari Express',
  'Honduras',
  '/logo/sari-logo.png',
  '#0038BD',
  '#07111F'
from public.tenants tenant
where tenant.slug = 'sari'
  and not exists (
    select 1
    from public.company_settings settings
    where settings.tenant_id = tenant.id
  );
