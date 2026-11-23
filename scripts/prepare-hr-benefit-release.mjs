import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const name = '20261123120000_hr_automatic_benefits.sql'
const source = fs.readFileSync(path.join('supabase/migrations', name), 'utf8').replaceAll('\r\n', '\n')
const previous = fs.readFileSync('supabase/migrations/20261120171000_hr_payroll.sql', 'utf8').replaceAll('\r\n', '\n')
const hash = value => createHash('sha256').update(value).digest('hex')
if (source.includes('$_hr10_source_$')) throw new Error('Delimitador reservado presente en SQL')
const guard = `begin;
select pg_advisory_xact_lock(hashtextextended('sari-hr-production-release',0));
do $guard$ begin
 if not exists(select 1 from public.platform_environment where singleton and environment='production') then raise exception 'Destino no es Production';end if;
 if not exists(select 1 from public.tenant_domains d join public.tenants t on t.id=d.tenant_id where d.hostname='sari.forwarders.app' and d.is_primary and d.is_active and t.status='Activo') then raise exception 'Tenant Sari no verificado';end if;
 if (select max(version) from supabase_migrations.schema_migrations) is distinct from '20261120171000' then raise exception 'Historial cambió: repetir preflight';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261120171000' and encode(sha256(convert_to(statements[1],'UTF8')),'hex')='${hash(previous)}') then raise exception 'HR-08 instalado difiere de la fuente revisada';end if;
 if to_regclass('public.hr_benefit_calculations') is not null or to_regclass('public.hr_benefit_credits') is not null then raise exception 'HR-10 ya existe: conciliar antes de reintentar';end if;
end $guard$;
`
const verify = `
insert into supabase_migrations.schema_migrations(version,name,statements) values('20261123120000','hr_automatic_benefits',array[$_hr10_source_$${source}$_hr10_source_$]);
do $verify$ declare t text;begin
 foreach t in array array['hr_benefit_calculations','hr_benefit_credits'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relrowsecurity) then raise exception 'Falta RLS en %',t;end if;
  if has_table_privilege('authenticated','public.'||t,'INSERT') or has_table_privilege('authenticated','public.'||t,'UPDATE') or has_table_privilege('authenticated','public.'||t,'DELETE') then raise exception 'Escritura directa no permitida';end if;
 end loop;
 if has_function_privilege('anon','public.hr_preview_benefits(uuid,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.hr_compute_benefits_internal(uuid,jsonb)','EXECUTE') then raise exception 'RPC interna expuesta';end if;
end $verify$;
notify pgrst,'reload schema';
commit;
`
const dir = path.resolve('.ua/intermediate')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'hr-benefit-production-release.sql'), guard + source + verify)
fs.writeFileSync(path.join(dir, 'hr-benefit-production-manifest.json'), JSON.stringify({ project: 'fwspgdzvlbtbgiupvrzo', previousVersion: '20261120171000', name, sha256: hash(source) }, null, 2))
console.log('Prepared HR-10 only; no connection or deployment performed.')
