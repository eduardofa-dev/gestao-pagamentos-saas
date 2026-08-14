export type CalculoJurosBancoEntrada = {
  valorOriginalCentavos: number;
  dataVencimento: string;
  dataCalculo: string;
  multaPercentual: number;
  jurosMensalPercentual: number;
};

export type CalculoJurosBancoResultado = {
  diasEmAtraso: number;
  multaCentavos: number;
  jurosCentavos: number;
  encargosCentavos: number;
  valorAtualizadoCentavos: number;
  taxaDiariaPercentual: number;
};

const MILISSEGUNDOS_POR_DIA = 86_400_000;
const PONTOS_BASE_POR_PERCENTUAL = 100;
const DIVISOR_PONTOS_BASE = 10_000;
const DIAS_CONVENCIONAIS_NO_MES = 30;

function validarDataISO(data: string, campo: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error(`${campo} deve estar no formato AAAA-MM-DD.`);
  }

  const [ano, mes, dia] = data.split("-").map(Number);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    dataUtc.getUTCFullYear() !== ano ||
    dataUtc.getUTCMonth() !== mes - 1 ||
    dataUtc.getUTCDate() !== dia
  ) {
    throw new Error(`${campo} é inválida.`);
  }
}

function dataParaNumeroDeDias(data: string): number {
  validarDataISO(data, "Data");
  const [ano, mes, dia] = data.split("-").map(Number);
  return Math.floor(Date.UTC(ano, mes - 1, dia) / MILISSEGUNDOS_POR_DIA);
}

function percentualParaPontosBase(percentual: number, campo: string): number {
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    throw new Error(`${campo} deve estar entre 0% e 100%.`);
  }
  return Math.round(percentual * PONTOS_BASE_POR_PERCENTUAL);
}

function dividirArredondando(numerador: bigint, denominador: bigint): bigint {
  return (numerador + denominador / 2n) / denominador;
}

function paraNumeroSeguro(valor: bigint): number {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero)) {
    throw new Error("O resultado ultrapassa o limite monetário permitido.");
  }
  return numero;
}

export function calcularDiasEmAtraso(dataVencimento: string, dataCalculo: string): number {
  const vencimento = dataParaNumeroDeDias(dataVencimento);
  const calculo = dataParaNumeroDeDias(dataCalculo);
  return Math.max(0, calculo - vencimento);
}

/**
 * Calcula uma estimativa usando juros simples proporcionais por dia.
 *
 * Fórmulas:
 * - multa = principal × multa%
 * - juros = principal × juros mensal% × dias em atraso ÷ 30
 * - total = principal + multa + juros
 *
 * A multa e os juros só são aplicados quando a data de cálculo é posterior
 * ao vencimento. O banco ou o emissor pode usar regras diferentes; por isso,
 * o resultado é sempre apresentado como estimativa.
 */
export function calcularJurosBanco(
  entrada: CalculoJurosBancoEntrada,
): CalculoJurosBancoResultado {
  const {
    valorOriginalCentavos,
    dataVencimento,
    dataCalculo,
    multaPercentual,
    jurosMensalPercentual,
  } = entrada;

  if (!Number.isSafeInteger(valorOriginalCentavos) || valorOriginalCentavos <= 0) {
    throw new Error("O valor original deve ser um número inteiro positivo de centavos.");
  }

  validarDataISO(dataVencimento, "Data de vencimento");
  validarDataISO(dataCalculo, "Data de cálculo");

  const multaPontosBase = percentualParaPontosBase(multaPercentual, "Multa");
  const jurosPontosBase = percentualParaPontosBase(
    jurosMensalPercentual,
    "Juros mensais",
  );
  const diasEmAtraso = calcularDiasEmAtraso(dataVencimento, dataCalculo);

  if (diasEmAtraso === 0) {
    return {
      diasEmAtraso: 0,
      multaCentavos: 0,
      jurosCentavos: 0,
      encargosCentavos: 0,
      valorAtualizadoCentavos: valorOriginalCentavos,
      taxaDiariaPercentual: jurosMensalPercentual / DIAS_CONVENCIONAIS_NO_MES,
    };
  }

  const principal = BigInt(valorOriginalCentavos);
  const multa = dividirArredondando(
    principal * BigInt(multaPontosBase),
    BigInt(DIVISOR_PONTOS_BASE),
  );
  const juros = dividirArredondando(
    principal * BigInt(jurosPontosBase) * BigInt(diasEmAtraso),
    BigInt(DIVISOR_PONTOS_BASE * DIAS_CONVENCIONAIS_NO_MES),
  );
  const encargos = multa + juros;
  const valorAtualizado = principal + encargos;

  return {
    diasEmAtraso,
    multaCentavos: paraNumeroSeguro(multa),
    jurosCentavos: paraNumeroSeguro(juros),
    encargosCentavos: paraNumeroSeguro(encargos),
    valorAtualizadoCentavos: paraNumeroSeguro(valorAtualizado),
    taxaDiariaPercentual: jurosMensalPercentual / DIAS_CONVENCIONAIS_NO_MES,
  };
}

export function formatarCentavosEmReal(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new Error("O valor deve ser informado em centavos inteiros.");
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

export function obterDataAtualISO(fuso = "America/Recife"): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}
