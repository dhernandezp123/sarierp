-- Alinear la eliminacion de metadata con los permisos del bucket:
-- solamente Admin u Operaciones con acceso al booking.
drop policy if exists booking_documents_delete_policy
  on public.booking_documents;

create policy booking_documents_delete_policy
on public.booking_documents
as permissive
for delete
to authenticated
using (
  public.can_manage_operations()
  and public.can_select_booking(booking_id)
);
