import assert from "node:assert/strict";
import test from "node:test";
import { calculateCalendarDays, createLocalCheck, describeCheckDate, formatDateLong, updateLocalCheck } from "../lib/check-data.ts";

test("calcula datas futuras em dias corridos", () => {
  assert.equal(calculateCalendarDays("2026-08-20", "2026-08-13"), 7);
  assert.equal(describeCheckDate(7), "compensa em 7 dias");
});

test("identifica a data de hoje e datas ultrapassadas", () => {
  assert.equal(calculateCalendarDays("2026-08-13", "2026-08-13"), 0);
  assert.equal(describeCheckDate(0), "compensa hoje");
  assert.equal(calculateCalendarDays("2026-08-10", "2026-08-13"), -3);
  assert.equal(describeCheckDate(-3), "está atrasado há 3 dias");
});

test("trata virada de mês e ano sem depender do fuso local", () => {
  assert.equal(calculateCalendarDays("2027-01-02", "2026-12-30"), 3);
  assert.equal(formatDateLong("2027-01-02"), "2 de janeiro de 2027");
});

test("rejeita data incompleta", () => {
  assert.throws(() => calculateCalendarDays("2026-08", "2026-08-13"), /Data inválida/);
});

test("altera o valor completo e os dados de um cheque", () => {
  const original = createLocalCheck({
    beneficiary: "Fornecedor A", bankName: "Banco A", branch: "001", accountNumber: "123",
    checkNumber: "100", companyId: "company", companyName: "Matriz", amountCents: 10000,
    issueDate: "2026-08-13", compensationDate: "2026-08-20", reminderDays: 1, notes: "",
  });
  const updated = updateLocalCheck(original, {
    beneficiary: "Fornecedor B", bankName: "Banco B", branch: "002", accountNumber: "456",
    checkNumber: "200", companyId: "company", companyName: "Matriz", amountCents: 234590,
    issueDate: "2026-08-14", compensationDate: "2026-08-30", reminderDays: 3, notes: "Alterado",
  });

  assert.equal(updated.id, original.id);
  assert.equal(updated.amountCents, 234590);
  assert.match(updated.value, /R\$\s?2\.345,90/);
  assert.equal(updated.checkNumber, "200");
  assert.equal(updated.notes, "Alterado");
});
