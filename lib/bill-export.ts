import type { Bill } from "./finance-data";
import { formatCnpj } from "./boleto-parser.ts";

export function buildBillExportRows(bills: Bill[]) {
  return [...bills]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((bill) => ({
      dueDate: bill.dueDate,
      createdAt: bill.createdAt,
      paidAt: bill.paidAt,
      company: bill.company,
      supplier: bill.supplier,
      supplierTaxId: formatCnpj(bill.supplierTaxId),
      amount: bill.amountCents / 100,
      category: bill.category,
      costCenter: bill.costCenter,
      status: bill.status,
      approvalStatus: bill.approvalStatus,
      lateFeeRate: bill.lateFeePercent / 100,
      monthlyInterestRate: bill.monthlyInterestPercent / 100,
      protestDays: bill.protestDays ?? null,
      barcode: bill.barcode ?? "",
      notes: bill.notes,
      hasPdf: bill.attachmentPath ? "Sim" : "Não",
    }));
}

function isoToDate(value: string | null) {
  if (!value) return null;
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "grupo";
}

export async function exportBillsToExcel(bills: Bill[], groupName: string) {
  if (!bills.length) throw new Error("Cadastre pelo menos um boleto antes de exportar.");

  const XLSX = await import("xlsx");
  const rows = buildBillExportRows(bills);
  const header = [
    "Vencimento", "Cadastro", "Pagamento", "Empresa / filial", "Fornecedor",
    "CNPJ do beneficiário", "Valor", "Categoria", "Centro de custo", "Status", "Aprovação",
    "Multa", "Juros ao mês", "Dias para protesto", "Código de barras", "Observações", "PDF anexado",
  ];
  const data = rows.map((row) => [
    isoToDate(row.dueDate), isoToDate(row.createdAt), isoToDate(row.paidAt), row.company,
    row.supplier, row.supplierTaxId, row.amount, row.category, row.costCenter, row.status,
    row.approvalStatus, row.lateFeeRate, row.monthlyInterestRate, row.protestDays, row.barcode, row.notes, row.hasPdf,
  ]);

  const detailSheet = XLSX.utils.aoa_to_sheet([
    [`Relatório de boletos — ${groupName}`],
    [`Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date())}`],
    [],
    header,
    ...data,
  ], { cellDates: true });

  detailSheet["!merges"] = [XLSX.utils.decode_range("A1:Q1"), XLSX.utils.decode_range("A2:Q2")];
  detailSheet["!autofilter"] = { ref: `A4:Q${rows.length + 4}` };
  detailSheet["!cols"] = [12, 12, 12, 22, 28, 20, 14, 20, 20, 18, 14, 11, 14, 16, 36, 30, 13].map((wch) => ({ wch }));

  for (let row = 5; row <= rows.length + 4; row += 1) {
    for (const column of ["A", "B", "C"]) if (detailSheet[`${column}${row}`]) detailSheet[`${column}${row}`].z = "dd/mm/yyyy";
    if (detailSheet[`G${row}`]) detailSheet[`G${row}`].z = 'R$ #,##0.00';
    for (const column of ["L", "M"]) if (detailSheet[`${column}${row}`]) detailSheet[`${column}${row}`].z = "0.00%";
  }

  const summarySheet = XLSX.utils.aoa_to_sheet([
    [`Resumo financeiro — ${groupName}`],
    [],
    ["Indicador", "Valor"],
    ["Total de boletos", { f: `COUNTA(Boletos!E5:E${rows.length + 4})` }],
    ["Valor total", { f: `SUM(Boletos!G5:G${rows.length + 4})` }],
    ["Boletos pagos", { f: `COUNTIF(Boletos!J5:J${rows.length + 4},\"Pago\")` }],
    ["Boletos vencidos", { f: `COUNTIF(Boletos!J5:J${rows.length + 4},\"Vencido\")` }],
  ]);
  summarySheet["!merges"] = [XLSX.utils.decode_range("A1:B1")];
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 18 }];
  if (summarySheet.B5) summarySheet.B5.z = 'R$ #,##0.00';

  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: `Relatório de boletos — ${groupName}`, Author: "Nexo Gestão de Pagamentos" };
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Boletos");
  XLSX.writeFile(workbook, `boletos-${safeFileName(groupName)}-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}
