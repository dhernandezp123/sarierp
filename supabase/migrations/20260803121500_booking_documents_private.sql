-- Los documentos operativos de bookings requieren autenticacion y policies
-- de Storage para su lectura. No modificar limites ni MIME configurados.
insert into storage.buckets (id, name, public)
values ('booking-documents', 'booking-documents', false)
on conflict (id) do update
set public = false;
