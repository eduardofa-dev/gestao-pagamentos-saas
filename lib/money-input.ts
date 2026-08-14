export function parseBrazilianMoney(value: string) {
  const cleaned = value.replace(/[^0-9,.-]/g, "").trim();
  if (!cleaned) return 0;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const amount = Number(normalized);

  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function moneyInputFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
