export type ParsedBillPdf = {
  supplier: string;
  supplierTaxId: string;
  amountCents: number | null;
  dueDate: string;
  barcode: string;
};

export function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function formatCnpj(value: string) {
  return normalizeCnpj(value)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function brazilianDateToIso(value: string) {
  const [day, month, year] = value.split(/[./-]/).map(Number);
  if (!day || !month || !year || month > 12 || day > 31) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function brazilianMoneyToCents(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function labeledMatch(text: string, labels: string, valuePattern: string) {
  return text.match(new RegExp(`(?:${labels})\\s*:?\\s*${valuePattern}`, "i"))?.[1]?.trim() ?? "";
}

export function parseBillPdfText(text: string): ParsedBillPdf {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  const dueDateText = labeledMatch(
    normalized,
    "data de vencimento|vencimento",
    "[^0-9]{0,30}(\\d{2}[./-]\\d{2}[./-]\\d{4})",
  );
  const amountText = labeledMatch(
    normalized,
    "valor do documento|valor cobrado|valor a pagar|valor nominal",
    "[^0-9]{0,30}(?:R\\$\\s*)?([0-9.]+,[0-9]{2})",
  );
  const supplier = labeledMatch(
    normalized,
    "benefici[aá]rio|cedente|favorecido",
    "([^\\n]{2,120})",
  ).replace(/\s{2,}.*/, "").trim();
  const labeledCnpj = labeledMatch(
    normalized,
    "cnpj(?:\\s+do)?\\s+(?:benefici[aá]rio|cedente|favorecido)|(?:benefici[aá]rio|cedente|favorecido)\\s*(?:-|–)?\\s*cnpj(?:\\/cpf)?",
    "[^0-9]{0,30}(\\d{2}[.]?\\d{3}[.]?\\d{3}\\/?\\d{4}-?\\d{2})",
  );
  const firstCnpj = normalized.match(/\b\d{2}[.]?\d{3}[.]?\d{3}\/?\d{4}-?\d{2}\b/)?.[0] ?? "";

  const barcodeCandidates = normalized
    .split("\n")
    .flatMap((line) => line.match(/[0-9][0-9. -]{40,80}[0-9]/g) ?? []);
  const barcode = barcodeCandidates
    .map((candidate) => candidate.replace(/\D/g, ""))
    .find((candidate) => candidate.length >= 44 && candidate.length <= 48) ?? "";

  return {
    supplier,
    supplierTaxId: normalizeCnpj(labeledCnpj || firstCnpj),
    amountCents: amountText ? brazilianMoneyToCents(amountText) : null,
    dueDate: dueDateText ? brazilianDateToIso(dueDateText) : "",
    barcode,
  };
}
