import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarCentavosEmReal, obterDataAtualISO } from "./calculo-juros.ts";
import type { WorkspaceContext } from "./finance-data.ts";

export type CheckDatabaseStatus = "scheduled" | "reminder_sent" | "compensated" | "cancelled";

export type CheckRecord = {
  id: string;
  beneficiary: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  checkNumber: string;
  company: string;
  companyId: string;
  amountCents: number;
  value: string;
  issueDate: string;
  compensationDate: string;
  compensationDateShort: string;
  compensationDateLong: string;
  daysUntil: number;
  reminderDays: number;
  databaseStatus: CheckDatabaseStatus;
  status: string;
  tone: string;
  initials: string;
  notes: string;
};

export type NewCheckInput = {
  beneficiary: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  checkNumber: string;
  companyId: string;
  companyName: string;
  amountCents: number;
  issueDate: string;
  compensationDate: string;
  reminderDays: number;
  notes: string;
};

type DatabaseCheck = {
  id: string;
  beneficiary: string;
  bank_name: string;
  branch: string | null;
  account_number: string | null;
  check_number: string;
  company_id: string;
  amount_cents: number | string;
  issue_date: string;
  compensation_date: string;
  reminder_days: number;
  status: CheckDatabaseStatus;
  notes: string | null;
  companies?: { name?: string } | Array<{ name?: string }> | null;
};

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function dateToDayNumber(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Data inválida");
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function calculateCalendarDays(targetDate: string, referenceDate = obterDataAtualISO()) {
  return dateToDayNumber(targetDate) - dateToDayNumber(referenceDate);
}

export function formatDateLong(isoDate: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

function formatDateShort(isoDate: string, referenceDate = obterDataAtualISO()) {
  const difference = calculateCalendarDays(isoDate, referenceDate);
  if (difference === 0) return "Hoje";
  if (difference === 1) return "Amanhã";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00Z`)).replace(".", "");
}

export function describeCheckDate(daysUntil: number) {
  if (daysUntil === 0) return "compensa hoje";
  if (daysUntil === 1) return "compensa amanhã";
  if (daysUntil > 1) return `compensa em ${daysUntil} dias`;
  if (daysUntil === -1) return "está atrasado há 1 dia";
  return `está atrasado há ${Math.abs(daysUntil)} dias`;
}

function statusPresentation(status: CheckDatabaseStatus, daysUntil: number, reminderDays: number) {
  if (status === "compensated") return { status: "Compensado", tone: "success" };
  if (status === "cancelled") return { status: "Cancelado", tone: "neutral" };
  if (daysUntil < 0) return { status: "Data ultrapassada", tone: "danger" };
  if (daysUntil === 0) return { status: "Compensa hoje", tone: "warning" };
  if (status === "reminder_sent") return { status: "Lembrete enviado", tone: "purple" };
  if (daysUntil <= reminderDays) return { status: "Próximo", tone: "yellow" };
  return { status: "Agendado", tone: "neutral" };
}

function initialsFromName(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "CH";
}

function createLocalId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapDatabaseCheck(row: DatabaseCheck): CheckRecord {
  const amountCents = Number(row.amount_cents);
  const daysUntil = calculateCalendarDays(row.compensation_date);
  const presentation = statusPresentation(row.status, daysUntil, row.reminder_days);
  return {
    id: row.id,
    beneficiary: row.beneficiary,
    bankName: row.bank_name,
    branch: row.branch ?? "",
    accountNumber: row.account_number ?? "",
    checkNumber: row.check_number,
    company: firstRelation(row.companies)?.name ?? "Empresa",
    companyId: row.company_id,
    amountCents,
    value: formatarCentavosEmReal(amountCents),
    issueDate: row.issue_date,
    compensationDate: row.compensation_date,
    compensationDateShort: formatDateShort(row.compensation_date),
    compensationDateLong: formatDateLong(row.compensation_date),
    daysUntil,
    reminderDays: row.reminder_days,
    databaseStatus: row.status,
    status: presentation.status,
    tone: presentation.tone,
    initials: initialsFromName(row.beneficiary),
    notes: row.notes ?? "",
  };
}

export function createLocalCheck(input: NewCheckInput): CheckRecord {
  return mapDatabaseCheck({
    id: createLocalId("check"),
    beneficiary: input.beneficiary,
    bank_name: input.bankName,
    branch: input.branch || null,
    account_number: input.accountNumber || null,
    check_number: input.checkNumber,
    company_id: input.companyId,
    companies: { name: input.companyName },
    amount_cents: input.amountCents,
    issue_date: input.issueDate,
    compensation_date: input.compensationDate,
    reminder_days: input.reminderDays,
    status: "scheduled",
    notes: input.notes || null,
  });
}

export function updateLocalCheck(check: CheckRecord, input: NewCheckInput): CheckRecord {
  return mapDatabaseCheck({
    id: check.id,
    beneficiary: input.beneficiary,
    bank_name: input.bankName,
    branch: input.branch || null,
    account_number: input.accountNumber || null,
    check_number: input.checkNumber,
    company_id: input.companyId,
    companies: { name: input.companyName },
    amount_cents: input.amountCents,
    issue_date: input.issueDate,
    compensation_date: input.compensationDate,
    reminder_days: input.reminderDays,
    status: check.databaseStatus,
    notes: input.notes || null,
  });
}

export function withCheckStatus(check: CheckRecord, databaseStatus: CheckDatabaseStatus): CheckRecord {
  const presentation = statusPresentation(databaseStatus, check.daysUntil, check.reminderDays);
  return { ...check, databaseStatus, status: presentation.status, tone: presentation.tone };
}

export async function loadChecks(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from("checks")
    .select("id, beneficiary, bank_name, branch, account_number, check_number, company_id, amount_cents, issue_date, compensation_date, reminder_days, status, notes, companies(name)")
    .eq("group_id", groupId)
    .order("compensation_date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as DatabaseCheck[]).map(mapDatabaseCheck);
}

export async function insertCheck(
  supabase: SupabaseClient,
  workspace: WorkspaceContext,
  input: NewCheckInput,
) {
  const { data, error } = await supabase
    .from("checks")
    .insert({
      group_id: workspace.groupId,
      company_id: input.companyId,
      beneficiary: input.beneficiary,
      bank_name: input.bankName,
      branch: input.branch || null,
      account_number: input.accountNumber || null,
      check_number: input.checkNumber,
      amount_cents: input.amountCents,
      issue_date: input.issueDate,
      compensation_date: input.compensationDate,
      reminder_days: input.reminderDays,
      notes: input.notes || null,
      created_by: workspace.userId,
    })
    .select("id, beneficiary, bank_name, branch, account_number, check_number, company_id, amount_cents, issue_date, compensation_date, reminder_days, status, notes, companies(name)")
    .single();
  if (error) throw error;
  return mapDatabaseCheck(data as unknown as DatabaseCheck);
}

export async function updateCheck(
  supabase: SupabaseClient,
  checkId: string,
  input: NewCheckInput,
) {
  const { data, error } = await supabase
    .from("checks")
    .update({
      company_id: input.companyId,
      beneficiary: input.beneficiary,
      bank_name: input.bankName,
      branch: input.branch || null,
      account_number: input.accountNumber || null,
      check_number: input.checkNumber,
      amount_cents: input.amountCents,
      issue_date: input.issueDate,
      compensation_date: input.compensationDate,
      reminder_days: input.reminderDays,
      notes: input.notes || null,
    })
    .eq("id", checkId)
    .select("id, beneficiary, bank_name, branch, account_number, check_number, company_id, amount_cents, issue_date, compensation_date, reminder_days, status, notes, companies(name)")
    .single();
  if (error) throw error;
  return mapDatabaseCheck(data as unknown as DatabaseCheck);
}

export async function markCheckCompensated(supabase: SupabaseClient, checkId: string) {
  const { error } = await supabase
    .from("checks")
    .update({ status: "compensated", compensated_at: new Date().toISOString() })
    .eq("id", checkId);
  if (error) throw error;
}

export async function deleteCheck(supabase: SupabaseClient, checkId: string) {
  const { error } = await supabase.from("checks").delete().eq("id", checkId);
  if (error) throw error;
}

export async function persistCheckReminder(
  supabase: SupabaseClient,
  workspace: WorkspaceContext,
  check: CheckRecord,
  message: string,
) {
  const { error: reminderError } = await supabase.from("check_reminders").insert({
    group_id: workspace.groupId,
    check_id: check.id,
    sent_by: workspace.userId,
    recipient_name: workspace.financeContactName,
    recipient_phone: workspace.financeContactPhone,
    message,
    status: "opened",
  });
  if (reminderError) throw reminderError;

  const { error: checkError } = await supabase
    .from("checks")
    .update({ status: "reminder_sent" })
    .eq("id", check.id);
  if (checkError) throw checkError;
}
