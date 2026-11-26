import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// UX-OPS-04: paquete de Production solo con 20261125120000. No conecta ni aplica.
const version = '20261125120000'
const name = 'operations_simplified_flow'
const previousVersion = '20261123210000'
// Huella de transition_bill_of_lading observada en el preflight del 25/11/2026:
// si cambió, la función reemplazada no es la revisada y el paquete se detiene.
const blFunctionMd5 = process.argv[2] || 'a8ff77dae8acde0ddac97d9d29d817bc'
const source = fs.readFileSync(path.join('supabase/migrations', `${version}_${name}.sql`), 'utf8').replaceAll('\r\n', '\n')
const hash = createHash('sha256').update(source).digest('hex')
if (source.includes('$_uxops04_source_$')) throw new Error('Delimitador reservado presente en SQL')

const guard = `begin;
select pg_advisory_xact_lock(hashtextextended('sari-operations-flow-release',0));
do $guard$ begin
 if not exists(select 1 from public.platform_environment where singleton and environment='production') then raise exception 'Destino no es Production';end if;
 if not exists(select 1 from public.tenant_domains d join public.tenants t on t.id=d.tenant_id where d.hostname='sari.forwarders.app' and d.is_primary and d.is_active and t.status='Activo') then raise exception 'Tenant Sari no verificado';end if;
 if (select max(version) from supabase_migrations.schema_migrations) is distinct from '${previousVersion}' then raise exception 'Historial cambió: repetir preflight';end if;
 if to_regprocedure('public.advance_booking_flow(uuid,timestamptz,text,timestamptz,text,text)') is not null
    or to_regprocedure('public.submit_booking_vgm_batch(uuid,jsonb,text)') is not null then raise exception 'UX-OPS-04 ya existe: conciliar antes de reintentar';end if;
 if md5(pg_get_functiondef('public.transition_bill_of_lading(uuid,text,text,timestamptz)'::regprocedure)) is distinct from '${blFunctionMd5}' then raise exception 'transition_bill_of_lading difiere de la version revisada';end if;
end $guard$;
create temporary table uxops04_counts on commit drop as
select (select count(*) from public.bookings) bookings, (select count(*) from public.bills_of_lading) bills,
       (select count(*) from public.container_vgm_records) vgm, (select count(*) from public.operational_events) events,
       (select md5(string_agg(id::text || coalesce(shipment_status,'') || updated_at::text, ',' order by id)) from public.bookings) bookings_md5,
       (select md5(string_agg(id::text || status || updated_at::text, ',' order by id)) from public.bills_of_lading) bills_md5;
`

const verify = `
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[$_uxops04_source_$${source}$_uxops04_source_$]);
do $verify$ declare f text; c record; begin
 foreach f in array array['public.advance_booking_flow(uuid,timestamptz,text,timestamptz,text,text)','public.submit_booking_vgm_batch(uuid,jsonb,text)','public.transition_bill_of_lading(uuid,text,text,timestamptz)'] loop
  if to_regprocedure(f) is null then raise exception 'Falta %',f;end if;
  if has_function_privilege('anon',f,'EXECUTE') then raise exception 'EXECUTE anonimo en %',f;end if;
  if not has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'authenticated sin EXECUTE en %',f;end if;
 end loop;
 select * into c from uxops04_counts;
 if c.bookings<>(select count(*) from public.bookings) or c.bills<>(select count(*) from public.bills_of_lading)
    or c.vgm<>(select count(*) from public.container_vgm_records) or c.events<>(select count(*) from public.operational_events)
    or c.bookings_md5 is distinct from (select md5(string_agg(id::text || coalesce(shipment_status,'') || updated_at::text, ',' order by id)) from public.bookings)
    or c.bills_md5 is distinct from (select md5(string_agg(id::text || status || updated_at::text, ',' order by id)) from public.bills_of_lading)
 then raise exception 'Los datos operativos cambiaron durante la migracion';end if;
end $verify$;
notify pgrst,'reload schema';
commit;
`
const dir = path.resolve('.ua/intermediate')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'operations-flow-production-release.sql'), guard + source + verify)
fs.writeFileSync(path.join(dir, 'operations-flow-production-manifest.json'), JSON.stringify({ project: 'fwspgdzvlbtbgiupvrzo', previousVersion, version, name, sha256: hash, blFunctionMd5 }, null, 2))
console.log(`Prepared ${version} only (sha256 ${hash}); no connection or deployment performed.`)
