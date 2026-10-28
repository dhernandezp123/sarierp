-- Fase 5: permisos explicitos para que una instalacion limpia no herede
-- EXECUTE publico sobre entrypoints internos SECURITY DEFINER.

revoke all on function public.create_invoice_with_items_trusted(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.create_invoice_from_quotation_tenant_internal(jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.create_freight_account_payable_tenant_internal(uuid)
  from public, anon, authenticated;
revoke all on function public.register_invoice_payment_tenant_internal(
  uuid, numeric, text, date, text, text, text
) from public, anon, authenticated;
revoke all on function public.register_invoice_payment_v2_tenant_internal(
  uuid, numeric, text, date, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.reverse_invoice_payment_tenant_internal(uuid, text)
  from public, anon, authenticated;
revoke all on function public.allocate_tenant_document_sequence(uuid, text, bigint)
  from public, anon, authenticated;
revoke all on function public.allocate_internal_hbl_number_for_tenant(uuid, date)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
