-- SOLO LECTURA. Contrastar hallazgos con las autorizaciones originales.
-- No corrige fechas ni documentos emitidos.
begin read only;
select id, cai, document_type, fecha_limite_emision, is_active, next_number,
  case
    when not isfinite(fecha_limite_emision)
      or fecha_limite_emision not between date '0001-01-01' and date '9999-12-31'
      then 'FECHA_INVALIDA'
    else 'VERIFICAR_CON_DOCUMENTO_ORIGINAL'
  end as revision
from public.cai_ranges
order by is_active desc, created_at desc;

select cr.id as cai_range_id, cr.fecha_limite_emision as fecha_rango,
  count(i.id) as documentos_con_fecha_no_representable
from public.cai_ranges cr
left join public.invoices i on i.cai = cr.cai
  and i.rango_desde = cr.rango_desde and i.rango_hasta = cr.rango_hasta
  and (not isfinite(i.fecha_limite_emision)
    or i.fecha_limite_emision not between date '0001-01-01' and date '9999-12-31')
where not isfinite(cr.fecha_limite_emision)
  or cr.fecha_limite_emision not between date '0001-01-01' and date '9999-12-31'
group by cr.id, cr.fecha_limite_emision;
rollback;
