export const PAYMENT_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export const PAYMENT_RECEIPT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

type PaymentReceiptFile = Pick<File, "name" | "size" | "type">;

export function validatePaymentReceipt(file: PaymentReceiptFile) {
  if (!PAYMENT_RECEIPT_MIME_TYPES.includes(file.type as (typeof PAYMENT_RECEIPT_MIME_TYPES)[number])) {
    throw new Error("Selecione um comprovante em PDF, JPG ou PNG.");
  }
  if (file.size > PAYMENT_RECEIPT_MAX_BYTES) {
    throw new Error("O comprovante deve ter no máximo 10 MB.");
  }
  if (file.size === 0) {
    throw new Error("O arquivo do comprovante está vazio.");
  }
}

export function canMarkBillPaid(bill: { paymentReceiptPath: string | null }) {
  return Boolean(bill.paymentReceiptPath);
}
