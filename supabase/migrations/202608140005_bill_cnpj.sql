alter table public.bills
  add column if not exists supplier_tax_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bills_supplier_tax_id_check'
  ) then
    alter table public.bills
      add constraint bills_supplier_tax_id_check
      check (supplier_tax_id is null or supplier_tax_id ~ '^[0-9]{14}$');
  end if;
end
$$;

comment on column public.bills.supplier_tax_id is
  'CNPJ do beneficiario do boleto, armazenado somente com 14 digitos.';
