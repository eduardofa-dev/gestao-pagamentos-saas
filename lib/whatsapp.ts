export const DEFAULT_REMINDER_TEMPLATE =
  "Olá, {nome}! Lembrete de pagamento: boleto de {fornecedor}, no valor de {valor}, com vencimento em {vencimento}. Por favor, confirme o pagamento assim que possível.";

export type ReminderTemplateData = {
  nome: string;
  fornecedor: string;
  valor: string;
  vencimento: string;
};

export type BulkReminderItem = {
  fornecedor: string;
  valor: string;
  vencimento: string;
};

export function normalizeWhatsAppPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function isValidWhatsAppPhone(input: string) {
  const normalized = normalizeWhatsAppPhone(input);
  return /^55\d{10,11}$/.test(normalized);
}

export function formatWhatsAppPhone(input: string) {
  const normalized = normalizeWhatsAppPhone(input);
  const national = normalized.startsWith("55") ? normalized.slice(2) : normalized;

  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return input.trim();
}

export function renderReminderTemplate(template: string, data: ReminderTemplateData) {
  const source = template.trim() || DEFAULT_REMINDER_TEMPLATE;
  return source.replace(/\{(nome|fornecedor|valor|vencimento)\}/g, (_, key: keyof ReminderTemplateData) => data[key]);
}

export function renderBulkReminderMessage(
  recipientName: string,
  bills: BulkReminderItem[],
  total: string,
) {
  const items = bills
    .map((bill, index) => `${index + 1}. ${bill.fornecedor} — ${bill.valor} — vencimento ${bill.vencimento}`)
    .join("\n");

  return `Olá, ${recipientName}! Segue o lembrete dos boletos selecionados:\n\n${items}\n\nTotal: ${total}. Por favor, confirme os pagamentos assim que possível.`;
}
