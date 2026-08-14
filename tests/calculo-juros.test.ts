import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularDiasEmAtraso,
  calcularJurosBanco,
  formatarCentavosEmReal,
} from "../lib/calculo-juros.ts";

test("não aplica encargos antes ou no vencimento", () => {
  const resultado = calcularJurosBanco({
    valorOriginalCentavos: 1_000_000,
    dataVencimento: "2026-08-13",
    dataCalculo: "2026-08-13",
    multaPercentual: 2,
    jurosMensalPercentual: 1,
  });

  assert.deepEqual(resultado, {
    diasEmAtraso: 0,
    multaCentavos: 0,
    jurosCentavos: 0,
    encargosCentavos: 0,
    valorAtualizadoCentavos: 1_000_000,
    taxaDiariaPercentual: 1 / 30,
  });
});

test("calcula multa única e juros simples proporcionais por dia", () => {
  const resultado = calcularJurosBanco({
    valorOriginalCentavos: 1_000_000,
    dataVencimento: "2026-08-01",
    dataCalculo: "2026-08-13",
    multaPercentual: 2,
    jurosMensalPercentual: 1,
  });

  assert.equal(resultado.diasEmAtraso, 12);
  assert.equal(resultado.multaCentavos, 20_000);
  assert.equal(resultado.jurosCentavos, 4_000);
  assert.equal(resultado.valorAtualizadoCentavos, 1_024_000);
});

test("calcula corretamente a diferença entre meses", () => {
  assert.equal(calcularDiasEmAtraso("2026-07-30", "2026-08-02"), 3);
});

test("arredonda o cálculo somente para centavos", () => {
  const resultado = calcularJurosBanco({
    valorOriginalCentavos: 99_999,
    dataVencimento: "2026-08-01",
    dataCalculo: "2026-08-02",
    multaPercentual: 2,
    jurosMensalPercentual: 1,
  });

  assert.equal(resultado.multaCentavos, 2_000);
  assert.equal(resultado.jurosCentavos, 33);
});

test("rejeita percentuais inválidos", () => {
  assert.throws(
    () => calcularJurosBanco({
      valorOriginalCentavos: 100_000,
      dataVencimento: "2026-08-01",
      dataCalculo: "2026-08-02",
      multaPercentual: -1,
      jurosMensalPercentual: 1,
    }),
    /Multa deve estar entre 0% e 100%/,
  );
});

test("formata centavos em real brasileiro", () => {
  assert.match(formatarCentavosEmReal(1_024_000), /R\$\s?10\.240,00/);
});
