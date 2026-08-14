import assert from "node:assert/strict";
import test from "node:test";
import { parseBillPdfText } from "../lib/boleto-parser.ts";

test("extrai os campos principais do texto de um boleto", () => {
  const result = parseBillPdfText(`
    Beneficiário: Companhia de Serviços LTDA
    CNPJ do Beneficiário: 12.345.678/0001-90
    Data de vencimento: 20/08/2026
    Valor do documento R$ 1.234,56
    34191.79001 01043.510047 91020.150008 5 98060000005280
  `);

  assert.equal(result.supplier, "Companhia de Serviços LTDA");
  assert.equal(result.supplierTaxId, "12345678000190");
  assert.equal(result.dueDate, "2026-08-20");
  assert.equal(result.amountCents, 123456);
  assert.equal(result.barcode, "34191790010104351004791020150008598060000005280");
});
