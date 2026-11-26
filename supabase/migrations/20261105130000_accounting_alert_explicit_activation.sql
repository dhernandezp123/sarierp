-- GOV-ALERTS-03B: ningun tenant recibe avisos automaticos sin activacion explicita.
-- Migracion separada: las fases anteriores ya fueron aplicadas en Production.
alter table public.accounting_alert_configuration_events alter column actor_id drop not null;
alter table public.accounting_alert_configuration_events add column configuration_source text not null default 'Usuario'
 check(configuration_source in ('Usuario','Despliegue autorizado'));
alter table public.accounting_alert_configuration_events add constraint accounting_alert_configuration_actor
 check(actor_id is not null or configuration_source='Despliegue autorizado');
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.accounting_alert_candidates_internal(uuid)'::regprocedure);
 needle:='coalesce((select internal_enabled from public.accounting_alert_settings where tenant_id=p_tenant),true)';
 if position(needle in definition)=0 then raise exception 'Activacion de candidatos no reconocida';end if;
 execute replace(definition,needle,replace(needle,',true)',',false)'));
 definition:=pg_get_functiondef('public.notify_invoice_courtesy_internal()'::regprocedure);
 needle:='coalesce((select internal_enabled from public.accounting_alert_settings where tenant_id=new.tenant_id),true)';
 if position(needle in definition)=0 then raise exception 'Activacion de cortesia no reconocida';end if;
 execute replace(definition,needle,replace(needle,',true)',',false)'));
 definition:=pg_get_functiondef('public.process_accounting_alerts()'::regprocedure);
 needle:='for tenant in select id from public.tenants loop';
 if position(needle in definition)=0 then raise exception 'Registro del scheduler no reconocido';end if;
 execute replace(definition,needle,'for tenant in select tenant_id as id from public.accounting_alert_settings loop');
end $$;
-- Configuracion inicial de Sari, sin suplantar al Admin ni activar clientes.
with activated as (
 insert into public.accounting_alert_settings(tenant_id,internal_enabled,portal_enabled,email_enabled)
 select id,true,false,false from public.tenants where id='00000000-0000-4000-8000-000000000001'
 on conflict(tenant_id) do nothing returning *
)
insert into public.accounting_alert_configuration_events(tenant_id,actor_id,reason,snapshot,configuration_source)
select tenant_id,null,'Activacion interna de Sari autorizada por Gerencia; clientes desactivados',to_jsonb(activated),'Despliegue autorizado' from activated;
notify pgrst,'reload schema';
