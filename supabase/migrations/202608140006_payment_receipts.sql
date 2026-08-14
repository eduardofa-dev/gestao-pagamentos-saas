-- Comprovantes de pagamento e bloqueio de quitação sem documento.
-- Execute depois de 202608140005_bill_cnpj.sql.

alter table public.bills
  add column if not exists payment_receipt_path text,
  add column if not exists payment_receipt_name text,
  add column if not exists payment_receipt_mime_type text,
  add column if not exists payment_receipt_uploaded_at timestamptz;

-- O mesmo bucket privado guarda o boleto original e o comprovante.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'bill-documents';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bills_payment_receipt_mime_type_check'
  ) then
    alter table public.bills
      add constraint bills_payment_receipt_mime_type_check
      check (
        payment_receipt_mime_type is null
        or payment_receipt_mime_type in ('application/pdf', 'image/jpeg', 'image/png')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bills_paid_requires_receipt_check'
  ) then
    alter table public.bills
      add constraint bills_paid_requires_receipt_check
      check (status <> 'paid' or payment_receipt_path is not null) not valid;
  end if;
end
$$;

comment on column public.bills.payment_receipt_path
  is 'Caminho privado do comprovante no bucket bill-documents';
comment on column public.bills.payment_receipt_name
  is 'Nome original do arquivo enviado pelo usuário';
comment on column public.bills.payment_receipt_mime_type
  is 'Tipo do comprovante: PDF, JPEG ou PNG';
comment on column public.bills.payment_receipt_uploaded_at
  is 'Data e hora em que o comprovante foi anexado';
