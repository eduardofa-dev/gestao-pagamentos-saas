import assert from "node:assert/strict";
import test from "node:test";
import { buildBillExportRows } from "../lib/bill-export.ts";
import type { Bill } from "../lib/finance-data.ts";

function bill(id: string, dueDate: string, amountCents: number): Bill {
  return {
    id, supplier: `Fornecedor ${id}`, supplierTaxId: "12345678000190", category: "Serviços", company: "Matriz", companyId: "company",
    due: dueDate, dueLong: dueDate, value: "", status: "Pendente", databaseStatus: "pending", tone: "neutral",
    initials: "FO", amountCents, dueDate, lateFeePercent: 2, monthlyInterestPercent: 1,
    costCenter: "Administrativo", notes: "", approvalStatus: "pending", paidAt: null,
    createdAt: "2026-08-01T10:00:00Z", attachmentPath: null,
  };
}

test("organiza as linhas da planilha pela data de vencimento", () => {
  const rows = buildBillExportRows([
    bill("B", "2026-09-10", 20000),
    bill("A", "2026-08-10", 10000),
  ]);
  assert.deepEqual(rows.map((row) => row.dueDate), ["2026-08-10", "2026-09-10"]);
  assert.deepEqual(rows.map((row) => row.amount), [100, 200]);
  assert.deepEqual(rows.map((row) => row.supplierTaxId), ["12.345.678/0001-90", "12.345.678/0001-90"]);
});
