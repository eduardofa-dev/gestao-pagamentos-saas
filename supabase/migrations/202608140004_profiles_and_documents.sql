-- Perfil, foto do usuário e armazenamento dos PDFs dos boletos.
-- Execute depois de 202608140003_whatsapp_settings.sql.

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bill-documents',
  'bill-documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_select_public on storage.objects
for select to public
using (bucket_id = 'profile-avatars');

create policy avatars_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy bill_documents_select_group on storage.objects
for select to authenticated
using (
  bucket_id = 'bill-documents'
  and (select private.is_group_member(((storage.foldername(name))[1])::uuid))
);

create policy bill_documents_insert_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'bill-documents'
  and (select private.has_group_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin','financeiro']::public.member_role[]
  ))
);

create policy bill_documents_update_staff on storage.objects
for update to authenticated
using (
  bucket_id = 'bill-documents'
  and (select private.has_group_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin','financeiro']::public.member_role[]
  ))
)
with check (
  bucket_id = 'bill-documents'
  and (select private.has_group_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin','financeiro']::public.member_role[]
  ))
);

create policy bill_documents_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'bill-documents'
  and (select private.has_group_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin']::public.member_role[]
  ))
);

comment on column public.profiles.avatar_path
  is 'Caminho da foto no bucket público profile-avatars';
