-- Configuração do contato financeiro por grupo empresarial.
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

alter table public.business_groups
  add column if not exists finance_contact_name text not null default '',
  add column if not exists finance_contact_phone text not null default '',
  add column if not exists reminder_message_template text not null default '';

comment on column public.business_groups.finance_contact_name
  is 'Nome do responsável que recebe lembretes do grupo';
comment on column public.business_groups.finance_contact_phone
  is 'WhatsApp com código do país, somente dígitos';
comment on column public.business_groups.reminder_message_template
  is 'Modelo editável para lembretes de boletos';
