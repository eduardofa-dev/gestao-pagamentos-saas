import assert from "node:assert/strict";
import test from "node:test";
import { groupBillsByDueDate } from "../lib/bill-groups.ts";
import type { Bill } from "../lib/finance-data.ts";

function bill(id: string, dueDate: string): Bill {
  return {
    id, supplier: id, supplierTaxId: "", category: "Outros", company: "Matriz", companyId: "company",
    due: dueDate, dueLong: dueDate, value: "R$ 100,00", status: "Pendente", databaseStatus: "pending",
    tone: "neutral", initials: "BL", amountCents: 10000, dueDate, lateFeePercent: 0,
    monthlyInterestPercent: 0, costCenter: "", notes: "", approvalStatus: "pending", paidAt: null,
    createdAt: "2026-08-14T10:00:00Z", attachmentPath: null, paymentReceiptPath: null,
    paymentReceiptName: "", paymentReceiptMimeType: "", paymentReceiptUploadedAt: null,
  };
}

test("separa os boletos por data de vencimento em ordem crescente", () => {
  const groups = groupBillsByDueDate([
    bill("C", "2026-09-01"),
    bill("A", "2026-08-20"),
    bill("B", "2026-08-20"),
  ]);

  assert.deepEqual(groups.map((group) => group.date), ["2026-08-20", "2026-09-01"]);
  assert.deepEqual(groups[0].bills.map((item) => item.id), ["A", "B"]);
  assert.deepEqual(groups[1].bills.map((item) => item.id), ["C"]);
});
