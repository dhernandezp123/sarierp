import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// WA-05: paquete de Production solo con 20261129120000. No conecta ni aplica.
const version = '20261129120000'
const name = 'whatsapp_request_dimensions_value'
const previousVersion = '20261128120000'
const source = fs.readFileSync(path.join('supabase/migrations', `${version}_${name}.sql`), 'utf8').replaceAll('\r\n', '\n')
const hash = createHash('sha256').update(source).digest('hex')
if (source.includes('$_wa05_source_$')) throw new Error('Delimitador reservado presente en SQL')

const guard = `begin;
select pg_advisory_xact_lock(hashtextextended('sari-whatsapp-release',0));
do $guard$ begin
 if not exists(select 1 from public.platform_environment where singleton and environment='production') then raise exception 'Destino no es Production';end if;
 if not exists(select 1 from public.tenant_domains d join public.tenants t on t.id=d.tenant_id where d.hostname='sari.forwarders.app' and d.is_primary and d.is_active and t.status='Activo' and t.slug='sari') then raise exception 'Tenant Sari no verificado';end if;
 if (select max(version) from supabase_migrations.schema_migrations) is distinct from '${previousVersion}' then raise exception 'Historial cambió: repetir preflight';end if;
 if to_regprocedure('public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text,boolean)') is null then raise exception 'Falta la version WA-03 de la funcion';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='solicitudes_cotizacion' and column_name in ('medidas','valor_declarado')) then raise exception 'WA-05 ya existe: conciliar antes de reintentar';end if;
end $guard$;
create temporary table wa05_counts on commit drop as
select (select count(*) from public.solicitudes_cotizacion) requests, (select count(*) from public.whatsapp_quote_senders) senders,
       (select md5(coalesce(string_agg(id::text || codigo || estado, ',' order by id),'')) from public.solicitudes_cotizacion) requests_md5;
`

const verify = `
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[$_wa05_source_$${source}$_wa05_source_$]);
do $verify$ declare f text; c record; begin
 if (select count(*) from information_schema.columns where table_schema='public' and table_name='solicitudes_cotizacion' and column_name in ('medidas','valor_declarado'))<>2 then raise exception 'Faltan columnas WA-05';end if;
 if position('valor_declarado' in pg_get_functiondef('public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text,boolean)'::regprocedure))=0 then raise exception 'La alta no guarda valor_declarado';end if;
 foreach f in array array['public.whatsapp_normalize_text(text)','public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text,boolean)'] loop
  if to_regprocedure(f) is null then raise exception 'Falta %',f;end if;
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'Expuesta a usuarios: %',f;end if;
  if not has_function_privilege('service_role',f,'EXECUTE') then raise exception 'service_role sin EXECUTE en %',f;end if;
 end loop;
 select * into c from wa05_counts;
 if c.requests<>(select count(*) from public.solicitudes_cotizacion) or c.senders<>(select count(*) from public.whatsapp_quote_senders)
    or c.requests_md5 is distinct from (select md5(coalesce(string_agg(id::text || codigo || estado, ',' order by id),'')) from public.solicitudes_cotizacion)
 then raise exception 'Los datos de WhatsApp cambiaron durante la migracion';end if;
end $verify$;
notify pgrst,'reload schema';
commit;
`
const dir = path.resolve('.ua/intermediate')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'whatsapp-fields-production-release.sql'), guard + source + verify)
fs.writeFileSync(path.join(dir, 'whatsapp-fields-production-manifest.json'), JSON.stringify({ project: 'fwspgdzvlbtbgiupvrzo', previousVersion, version, name, sha256: hash }, null, 2))
console.log(`Prepared ${version} only (sha256 ${hash}); no connection or deployment performed.`)
