begin;
insert into public.clientes(id, tenant_id, codigo_cliente, nombre, rtn, condicion_pago)
values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  'ATLAS-DEMO','Atlas Forwarding Demo','DEMO-NO-FISCAL','Contado')
on conflict(id) do nothing;
update public.company_settings
set legal_name = 'Atlas Forwarding Demo', rtn = 'DEMO-NO-FISCAL',
    address = 'Dirección de prueba de Atlas Demo'
where tenant_id = '00000000-0000-4000-8000-000000000001';
update public.platform_environment
set dataset_version = 'atlas-forwarding-demo-v1', dataset_seeded_at = now(),
    dataset_client_id = '10000000-0000-4000-8000-000000000001'
where singleton;

-- APPLY_DEMO_BILLING_FIXTURES

insert into auth.users(id,email,raw_user_meta_data)
values('de261200-0000-4000-8000-000000000031','demo-billing-test@example.invalid','{}');
update public.profiles set rol='Admin',status='Aprobado',is_active=true,
  tenant_id='00000000-0000-4000-8000-000000000001',is_demo_user=true,
  demo_expires_at=now()+interval '1 hour',demo_access_grant_id='de261200-0000-4000-8000-000000000039'
where id='de261200-0000-4000-8000-000000000031';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"de261200-0000-4000-8000-000000000031","role":"authenticated","app_metadata":{"demo_access_grant_id":"de261200-0000-4000-8000-000000000039"}}',true);

do $$
declare
  payload jsonb := jsonb_build_object('invoice_type','Proforma',
    'cliente_id','10000000-0000-4000-8000-000000000001','point_of_sale','San Pedro Sula',
    'currency','HNL','fiscal_mode','Mixta','issue_date',current_date);
  lines jsonb := '[{"description":"Servicio ficticio Atlas Demo","quantity":2,"unit_price":75,"isv_rate":15}]';
  proforma uuid;
  invoice uuid;
  next_before bigint;
begin
  if not public.is_demo_access_active()
    or (select count(*) from public.cai_ranges where is_active and document_type='Factura'
        and cai in ('DEMO-SPS-SIN-VALIDEZ','DEMO-TGU-SIN-VALIDEZ')) <> 2
  then raise exception 'QA admin cannot access Demo billing configuration'; end if;

  select next_number into strict next_before from public.cai_ranges
  where cai='DEMO-SPS-SIN-VALIDEZ';
  select invoice_id into strict proforma
  from public.create_manual_invoice_with_items(payload, lines);
  if not exists(select 1 from public.invoices where id=proforma and invoice_type='Proforma'
    and cai is null and total=172.50)
    or (select next_number from public.cai_ranges where cai='DEMO-SPS-SIN-VALIDEZ') <> next_before
  then raise exception 'Proforma must preserve amounts and never consume a fiscal number'; end if;

  perform public.save_invoice_draft(
    'de261200-0000-4000-8000-000000000041',0,'de261200-0000-4000-8000-000000000042',
    payload || '{"invoice_type":"Factura"}',lines,'{}'
  );
  select invoice_id into strict invoice
  from public.issue_invoice_draft('de261200-0000-4000-8000-000000000041',1);
  if not exists(select 1 from public.invoices where id=invoice and invoice_type='Factura'
    and cai='DEMO-SPS-SIN-VALIDEZ' and total=172.50)
    or not exists(select 1 from public.invoice_receivables where invoice_id=invoice and balance=172.50)
    or (select next_number from public.cai_ranges where cai='DEMO-SPS-SIN-VALIDEZ') <> next_before + 1
  then raise exception 'Demo fiscal document must match its draft, range and receivable'; end if;
end $$;

reset role;
select set_config('request.jwt.claims','{}',true);
create temp table demo_cai_after_issue as
select id, next_number from public.cai_ranges;

-- APPLY_DEMO_BILLING_FIXTURES

do $$
begin
  if exists(select id,next_number from public.cai_ranges except select * from demo_cai_after_issue)
  then raise exception 'Reapplying fixtures changed an existing sequence'; end if;
end $$;
select 'PASS Demo proforma, invoice, receivable, tax and numbering' as result;
rollback;
