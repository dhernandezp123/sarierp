-- La factura SARI USA original no imprime correo: el correo del emisor es opcional,
-- igual que el sitio web. Razón social, dirección y teléfono siguen siendo obligatorios.
create or replace function public.capture_manual_invoice_issuer()
returns trigger language plpgsql security definer set search_path=public as $$
declare settings public.company_settings%rowtype;
begin
  select * into settings from public.company_settings where tenant_id=new.tenant_id;
  if nullif(btrim(settings.usa_legal_name),'') is null or nullif(btrim(settings.usa_address),'') is null
    or nullif(btrim(settings.usa_phone),'') is null then
    raise exception 'Completa el emisor SARI USA en Configuración de empresa';
  end if;
  new.data := jsonb_set(new.data,'{issuer}',jsonb_build_object('name',settings.usa_legal_name,
    'address',settings.usa_address,'phone',settings.usa_phone,'email',settings.usa_email,'website',settings.usa_website));
  return new;
end $$;
revoke all on function public.capture_manual_invoice_issuer() from public,anon,authenticated;

notify pgrst, 'reload schema';
