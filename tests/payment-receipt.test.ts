import assert from "node:assert/strict";
import test from "node:test";
import {
  canMarkBillPaid,
  PAYMENT_RECEIPT_MAX_BYTES,
  validatePaymentReceipt,
} from "../lib/payment-receipt.ts";

test("só libera o pagamento quando há comprovante", () => {
  assert.equal(canMarkBillPaid({ paymentReceiptPath: null }), false);
  assert.equal(canMarkBillPaid({ paymentReceiptPath: "grupo/boleto/comprovante" }), true);
});

test("aceita comprovantes em PDF, JPG e PNG", () => {
  for (const type of ["application/pdf", "image/jpeg", "image/png"]) {
    assert.doesNotThrow(() => validatePaymentReceipt({ name: "comprovante", type, size: 1024 }));
  }
});

test("recusa formato inválido, arquivo vazio e arquivo maior que 10 MB", () => {
  assert.throws(
    () => validatePaymentReceipt({ name: "comprovante.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1024 }),
    /PDF, JPG ou PNG/,
  );
  assert.throws(
    () => validatePaymentReceipt({ name: "vazio.pdf", type: "application/pdf", size: 0 }),
    /vazio/,
  );
  assert.throws(
    () => validatePaymentReceipt({ name: "grande.pdf", type: "application/pdf", size: PAYMENT_RECEIPT_MAX_BYTES + 1 }),
    /10 MB/,
  );
});
