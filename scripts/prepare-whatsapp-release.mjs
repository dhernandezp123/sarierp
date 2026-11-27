import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// WA-01: paquete de Production solo con 20261126120000. No conecta ni aplica.
const version = '20261126120000'
const name = 'whatsapp_quote_requests'
const previousVersion = '20261125120000'
const source = fs.readFileSync(path.join('supabase/migrations', `${version}_${name}.sql`), 'utf8').replaceAll('\r\n', '\n')
const hash = createHash('sha256').update(source).digest('hex')
if (source.includes('$_wa01_source_$')) throw new Error('Delimitador reservado presente en SQL')

const guard = `begin;
select pg_advisory_xact_lock(hashtextextended('sari-whatsapp-release',0));
do $guard$ begin
 if not exists(select 1 from public.platform_environment where singleton and environment='production') then raise exception 'Destino no es Production';end if;
 if not exists(select 1 from public.tenant_domains d join public.tenants t on t.id=d.tenant_id where d.hostname='sari.forwarders.app' and d.is_primary and d.is_active and t.status='Activo' and t.slug='sari') then raise exception 'Tenant Sari no verificado';end if;
 if (select max(version) from supabase_migrations.schema_migrations) is distinct from '${previousVersion}' then raise exception 'Historial cambió: repetir preflight';end if;
 if to_regclass('public.whatsapp_quote_senders') is not null or to_regclass('public.solicitudes_cotizacion') is not null then raise exception 'WA-01 ya existe: conciliar antes de reintentar';end if;
end $guard$;
create temporary table wa01_counts on commit drop as
select (select count(*) from public.profiles) profiles, (select count(*) from public.tenants) tenants,
       (select md5(string_agg(id::text || coalesce(rol::text,'') || status || coalesce(tenant_id::text,''), ',' order by id)) from public.profiles) profiles_md5;
`

const verify = `
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[$_wa01_source_$${source}$_wa01_source_$]);
do $verify$ declare f text; t text; c record; begin
 foreach t in array array['public.whatsapp_quote_senders','public.solicitudes_cotizacion'] loop
  if to_regclass(t) is null then raise exception 'Falta %',t;end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'RLS inactivo en %',t;end if;
  if has_table_privilege('anon',t,'SELECT') then raise exception 'SELECT anonimo en %',t;end if;
  if has_table_privilege('authenticated',t,'INSERT') or has_table_privilege('authenticated',t,'UPDATE') or has_table_privilege('authenticated',t,'DELETE') then raise exception 'Escritura directa de authenticated en %',t;end if;
 end loop;
 foreach f in array array['public.whatsapp_has_role(text[])','public.whatsapp_save_sender(uuid,uuid,text,boolean)','public.whatsapp_delete_sender(uuid)','public.whatsapp_set_quote_request_status(uuid,text)'] loop
  if to_regprocedure(f) is null then raise exception 'Falta %',f;end if;
  if has_function_privilege('anon',f,'EXECUTE') then raise exception 'EXECUTE anonimo en %',f;end if;
  if not has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'authenticated sin EXECUTE en %',f;end if;
 end loop;
 foreach f in array array['public.whatsapp_find_sender(uuid,text)','public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text)'] loop
  if to_regprocedure(f) is null then raise exception 'Falta %',f;end if;
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'Webhook RPC expuesta a usuarios: %',f;end if;
  if not has_function_privilege('service_role',f,'EXECUTE') then raise exception 'service_role sin EXECUTE en %',f;end if;
 end loop;
 select * into c from wa01_counts;
 if c.profiles<>(select count(*) from public.profiles) or c.tenants<>(select count(*) from public.tenants)
    or c.profiles_md5 is distinct from (select md5(string_agg(id::text || coalesce(rol::text,'') || status || coalesce(tenant_id::text,''), ',' order by id)) from public.profiles)
 then raise exception 'Perfiles o tenants cambiaron durante la migracion';end if;
end $verify$;
notify pgrst,'reload schema';
commit;
`
const dir = path.resolve('.ua/intermediate')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'whatsapp-production-release.sql'), guard + source + verify)
fs.writeFileSync(path.join(dir, 'whatsapp-production-manifest.json'), JSON.stringify({ project: 'fwspgdzvlbtbgiupvrzo', previousVersion, version, name, sha256: hash }, null, 2))
console.log(`Prepared ${version} only (sha256 ${hash}); no connection or deployment performed.`)
