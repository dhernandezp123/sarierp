import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// WA-04: paquete de Production solo con 20261128120000. No conecta ni aplica.
const version = '20261128120000'
const name = 'whatsapp_quote_conversion'
const previousVersion = '20261127120000'
const source = fs.readFileSync(path.join('supabase/migrations', `${version}_${name}.sql`), 'utf8').replaceAll('\r\n', '\n')
const hash = createHash('sha256').update(source).digest('hex')
if (source.includes('$_wa04_source_$')) throw new Error('Delimitador reservado presente en SQL')

const fingerprint = `(select count(*) from public.solicitudes_cotizacion) requests,
       (select md5(coalesce(string_agg(id::text || codigo || estado, ',' order by id),'')) from public.solicitudes_cotizacion) requests_md5,
       (select count(*) from public.quotations) quotations, (select count(*) from public.clientes) clientes`

const guard = `begin;
select pg_advisory_xact_lock(hashtextextended('sari-whatsapp-release',0));
do $guard$ begin
 if not exists(select 1 from public.platform_environment where singleton and environment='production') then raise exception 'Destino no es Production';end if;
 if not exists(select 1 from public.tenant_domains d join public.tenants t on t.id=d.tenant_id where d.hostname='sari.forwarders.app' and d.is_primary and d.is_active and t.status='Activo' and t.slug='sari') then raise exception 'Tenant Sari no verificado';end if;
 if (select max(version) from supabase_migrations.schema_migrations) is distinct from '${previousVersion}' then raise exception 'Historial cambió: repetir preflight';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='solicitudes_cotizacion' and column_name='quotation_id')
    or to_regprocedure('public.whatsapp_convert_quote_request(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)') is not null then raise exception 'WA-04 ya existe: conciliar antes de reintentar';end if;
 if to_regprocedure('public.create_quotation_with_child_lines(jsonb,jsonb,jsonb,jsonb)') is null then raise exception 'Falta create_quotation_with_child_lines';end if;
end $guard$;
create temporary table wa04_counts on commit drop as select ${fingerprint};
`

const verify = `
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[$_wa04_source_$${source}$_wa04_source_$]);
do $verify$ declare c record; n record; begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='solicitudes_cotizacion' and column_name='quotation_id') then raise exception 'Falta quotation_id';end if;
 if (select count(*) from pg_constraint where conrelid='public.solicitudes_cotizacion'::regclass and conname in
  ('solicitudes_cotizacion_quotation_unique','solicitudes_cotizacion_quotation_fkey','solicitudes_cotizacion_conversion_check'))<>3 then raise exception 'Faltan restricciones de conversion';end if;
 if not (select relrowsecurity from pg_class where oid='public.solicitudes_cotizacion'::regclass) then raise exception 'RLS inactivo';end if;
 if has_table_privilege('authenticated','public.solicitudes_cotizacion','UPDATE') then raise exception 'UPDATE directo para authenticated';end if;
 if has_function_privilege('anon','public.whatsapp_convert_quote_request(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.whatsapp_convert_quote_request(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)','EXECUTE') then raise exception 'Permisos de conversion incorrectos';end if;
 if has_function_privilege('anon','public.whatsapp_is_quote_owner(uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.whatsapp_is_quote_owner(uuid,uuid)','EXECUTE') then raise exception 'whatsapp_is_quote_owner expuesta';end if;
 if has_function_privilege('anon','public.whatsapp_set_quote_request_status(uuid,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.whatsapp_set_quote_request_status(uuid,text)','EXECUTE') then raise exception 'Permisos de estado incorrectos';end if;
 select * into c from wa04_counts;
 select ${fingerprint} into n;
 if c.requests<>n.requests or c.requests_md5 is distinct from n.requests_md5 or c.quotations<>n.quotations or c.clientes<>n.clientes
 then raise exception 'Datos cambiaron durante la migracion';end if;
 if exists(select 1 from public.solicitudes_cotizacion where quotation_id is not null) then raise exception 'Vinculos inesperados';end if;
end $verify$;
notify pgrst,'reload schema';
commit;
`
const dir = path.resolve('.ua/intermediate')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'whatsapp-conversion-production-release.sql'), guard + source + verify)
fs.writeFileSync(path.join(dir, 'whatsapp-conversion-production-manifest.json'), JSON.stringify({ project: 'fwspgdzvlbtbgiupvrzo', previousVersion, version, name, sha256: hash }, null, 2))
console.log(`Prepared ${version} only (sha256 ${hash}); no connection or deployment performed.`)
