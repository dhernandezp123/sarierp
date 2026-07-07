-- Miami bodega: el transportista pertenece al manifiesto (un lote = un carrier);
-- los paquetes escaneados lo heredan.

alter table public.miami_manifests
  add column if not exists carrier text;
