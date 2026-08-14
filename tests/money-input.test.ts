import assert from "node:assert/strict";
import test from "node:test";
import { moneyInputFromCents, parseBrazilianMoney } from "../lib/money-input.ts";

test("aceita valores digitados com vírgula e separador de milhar", () => {
  assert.equal(parseBrazilianMoney("1.250,75"), 1250.75);
  assert.equal(parseBrazilianMoney("R$ 2.000,00"), 2000);
});

test("aceita valor digitado com ponto decimal", () => {
  assert.equal(parseBrazilianMoney("1250.75"), 1250.75);
  assert.equal(moneyInputFromCents(123456), "1234,56");
});
