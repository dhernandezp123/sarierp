-- Registra nuevas ediciones sin modificar ni invalidar las versiones históricas.
insert into public.legal_document_versions (
  document_key,
  version,
  document_path,
  content_sha256
)
values
  (
    'platform',
    '2026-09-24',
    '/legal/platform-2026-09-24.json',
    'a6458ebcf3965c2ba4e03061cd73f571b385de895623b490dbd44575751e83ca'
  ),
  (
    'logistics',
    '2026-09-24',
    '/legal/logistics-2026-09-24.json',
    '11e0e7bcc3889798788c763e34a7e421c963b65c4375d902c272c34ee2916d26'
  );
