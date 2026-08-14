import assert from "node:assert/strict";
import test from "node:test";
import { calculateCalendarDays, describeCheckDate, formatDateLong } from "../lib/check-data.ts";

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
