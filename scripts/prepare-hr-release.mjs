import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// Prepara solamente SQL revisable; nunca conecta ni despliega automáticamente.
const names = [
 '20261118120000_hr_employees_and_leave.sql',
 '20261119120000_hr_vacation_periods.sql',
 '20261120141000_hr_activity_and_calendar.sql',
 '20261120151000_hr_certificates_and_private_documents.sql',
 '20261120161000_hr_email_outbox.sql',
 '20261120171000_hr_payroll.sql',
]
const migrations = names.map(name => {
 const source = fs.readFileSync(path.join('supabase/migrations', name), 'utf8').replaceAll('\r\n', '\n')
 if (source.includes('$_hr_source_$')) throw new Error('El delimitador del release aparece en una migración')
 return { name, version: name.slice(0,14), source, sha256: createHash('sha256').update(source).digest('hex') }
})
const versions = migrations.map(m => `'${m.version}'`).join(',')
const guard = `begin;
select pg_advisory_xact_lock(hashtextextended('sari-hr-production-release',0));
do $hr_guard$ begin
 if not exists(select 1 from public.platform_environment where singleton and environment='production') then raise exception 'Release HR bloqueado: ambiente distinto de Production';end if;
 if not exists(select 1 from public.tenant_domains d join public.tenants t on t.id=d.tenant_id where d.hostname='sari.forwarders.app' and d.is_primary and d.is_active and t.status='Activo') then raise exception 'Release HR bloqueado: destino Sari no verificado';end if;
 if (select max(version) from supabase_migrations.schema_migrations) is distinct from '20261120140000' then raise exception 'El historial remoto cambió: repetir preflight antes de aplicar HR';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version in (${versions})) or to_regclass('public.hr_employees') is not null then raise exception 'HR ya existe o hay una aplicación parcial: conciliar antes de reintentar';end if;
end $hr_guard$;
`
const statements = migrations.map(m => `\n-- ${m.name} | SHA-256 ${m.sha256}\n${m.source}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${m.version}','${m.name.slice(15,-4)}',array[$_hr_source_$${m.source}$_hr_source_$]);\n`).join('\n')
const checks = `
do $hr_verify$ begin
 if (select count(*) from supabase_migrations.schema_migrations where version in (${versions}))<>6 then raise exception 'Historial HR incompleto';end if;
 if not exists(select 1 from storage.buckets where id='hr-signed-documents' and not public) then raise exception 'Bucket HR no es privado';end if;
 if has_function_privilege('authenticated','public.hr_prepare_document_upload(uuid,uuid,text,text,integer,text,date,uuid)','EXECUTE') or has_function_privilege('authenticated','public.get_hr_email_dispatch(uuid)','EXECUTE') then raise exception 'RPC privada concedida a clientes';end if;
end $hr_verify$;
notify pgrst,'reload schema';
commit;
`
const dir = path.resolve('.ua/intermediate')
fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(path.join(dir,'hr-production-release.sql'),guard+statements+checks)
fs.writeFileSync(path.join(dir,'hr-production-release-manifest.json'),JSON.stringify({ expectedProject:'fwspgdzvlbtbgiupvrzo',expectedEnvironment:'production',expectedPreviousMigration:'20261120140000',migrations:migrations.map(m=>({name:m.name,version:m.version,sha256:m.sha256}))},null,2))
console.log('Prepared six intended-only HR migrations in .ua/intermediate/hr-production-release.sql. No database connection or deployment performed.')
