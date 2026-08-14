import type { SupabaseClient, User } from "@supabase/supabase-js";
import { formatarCentavosEmReal, obterDataAtualISO } from "./calculo-juros";

export type MemberRole = "admin" | "financeiro" | "aprovador";

export type CompanyOption = {
  id: string;
  name: string;
};

export type Bill = {
  id: string;
  supplier: string;
  supplierTaxId: string;
  category: string;
  company: string;
  companyId: string;
  due: string;
  dueLong: string;
  value: string;
  status: string;
  databaseStatus: "pending" | "reminder_sent" | "paid" | "cancelled";
  tone: string;
  initials: string;
  barcode?: string;
  protestDays?: number | null;
  amountCents: number;
  dueDate: string;
  lateFeePercent: number;
  monthlyInterestPercent: number;
  costCenter: string;
  notes: string;
  approvalStatus: "pending" | "approved" | "rejected";
  paidAt: string | null;
  createdAt: string;
  attachmentPath: string | null;
};

export type NewBillInput = {
  supplier: string;
  supplierTaxId: string;
  category: string;
  companyId: string;
  companyName: string;
  amountCents: number;
  dueDate: string;
  barcode: string;
  protestDays: number | null;
  lateFeePercent: number;
  monthlyInterestPercent: number;
  costCenter: string;
  notes: string;
  pdfFile?: File | null;
};

export type WorkspaceContext = {
  groupId: string;
  groupName: string;
  financeContactName: string;
  financeContactPhone: string;
  reminderMessageTemplate: string;
  role: MemberRole;
  companies: CompanyOption[];
  userId: string;
  userName: string;
  userEmail: string;
  avatarPath: string | null;
  avatarUrl: string;
};

export type FinanceContactInput = {
  name: string;
  phone: string;
  messageTemplate: string;
};

export type ProfileSettingsInput = {
  name: string;
  avatarFile?: File | null;
};

type DatabaseBill = {
  id: string;
  supplier: string;
  supplier_tax_id: string | null;
  category: string;
  company_id: string;
  amount_cents: number | string;
  due_date: string;
  status: Bill["databaseStatus"];
  late_fee_bps: number;
  monthly_interest_bps: number;
  protest_days: number | null;
  barcode: string | null;
  cost_center: string | null;
  notes: string | null;
  approval_status: Bill["approvalStatus"];
  paid_at: string | null;
  created_at: string;
  attachment_path: string | null;
  companies?: { name?: string } | Array<{ name?: string }> | null;
};

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function titleCaseRole(role: MemberRole) {
  if (role === "admin") return "Administrador";
  if (role === "financeiro") return "Financeiro";
  return "Aprovador";
}

export function roleLabel(role: MemberRole) {
  return titleCaseRole(role);
}

function initialsFromName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "BL";
}

function createLocalId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dateToDayNumber(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function duePresentation(dueDate: string) {
  const today = obterDataAtualISO();
  const difference = dateToDayNumber(dueDate) - dateToDayNumber(today);
  if (difference === 0) return "Hoje";
  if (difference === 1) return "Amanhã";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dueDate}T12:00:00Z`)).replace(".", "");
}

function dueLongPresentation(dueDate: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dueDate}T12:00:00Z`));
}

function statusPresentation(databaseStatus: Bill["databaseStatus"], dueDate: string) {
  if (databaseStatus === "paid") return { status: "Pago", tone: "success" };
  if (databaseStatus === "cancelled") return { status: "Cancelado", tone: "neutral" };
  if (databaseStatus === "reminder_sent") return { status: "Lembrete enviado", tone: "purple" };

  const difference = dateToDayNumber(dueDate) - dateToDayNumber(obterDataAtualISO());
  if (difference < 0) return { status: "Vencido", tone: "danger" };
  if (difference === 0) return { status: "Vence hoje", tone: "warning" };
  if (difference === 1) return { status: "Vence amanhã", tone: "yellow" };
  return { status: "Pendente", tone: "neutral" };
}

function mapDatabaseBill(row: DatabaseBill): Bill {
  const amountCents = Number(row.amount_cents);
  const presentation = statusPresentation(row.status, row.due_date);
  const company = firstRelation(row.companies)?.name ?? "Empresa";

  return {
    id: row.id,
    supplier: row.supplier,
    supplierTaxId: row.supplier_tax_id ?? "",
    category: row.category,
    company,
    companyId: row.company_id,
    due: duePresentation(row.due_date),
    dueLong: dueLongPresentation(row.due_date),
    value: formatarCentavosEmReal(amountCents),
    status: presentation.status,
    databaseStatus: row.status,
    tone: presentation.tone,
    initials: initialsFromName(row.supplier),
    barcode: row.barcode ?? undefined,
    protestDays: row.protest_days,
    amountCents,
    dueDate: row.due_date,
    lateFeePercent: row.late_fee_bps / 100,
    monthlyInterestPercent: row.monthly_interest_bps / 100,
    costCenter: row.cost_center ?? "",
    notes: row.notes ?? "",
    approvalStatus: row.approval_status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    attachmentPath: row.attachment_path,
  };
}

export function createLocalBill(input: NewBillInput): Bill {
  return mapDatabaseBill({
    id: createLocalId("bill"),
    supplier: input.supplier,
    supplier_tax_id: input.supplierTaxId || null,
    category: input.category,
    company_id: input.companyId,
    companies: { name: input.companyName },
    amount_cents: input.amountCents,
    due_date: input.dueDate,
    status: "pending",
    late_fee_bps: Math.round(input.lateFeePercent * 100),
    monthly_interest_bps: Math.round(input.monthlyInterestPercent * 100),
    protest_days: input.protestDays,
    barcode: input.barcode || null,
    cost_center: input.costCenter || null,
    notes: input.notes || null,
    approval_status: "pending",
    paid_at: null,
    created_at: new Date().toISOString(),
    attachment_path: input.pdfFile ? `local:${input.pdfFile.name}` : null,
  });
}

export async function loadWorkspace(
  supabase: SupabaseClient,
  user: User,
): Promise<WorkspaceContext | null> {
  const { data: membershipData, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id, role, business_groups!inner(id, name, finance_contact_name, finance_contact_phone, reminder_message_template)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membershipData) return null;

  const membership = membershipData as unknown as {
    group_id: string;
    role: MemberRole;
    business_groups: {
      id: string;
      name: string;
      finance_contact_name: string;
      finance_contact_phone: string;
      reminder_message_template: string;
    } | Array<{
      id: string;
      name: string;
      finance_contact_name: string;
      finance_contact_phone: string;
      reminder_message_template: string;
    }>;
  };
  const group = firstRelation(membership.business_groups);
  if (!group) return null;

  const [{ data: companiesData, error: companiesError }, { data: profileData }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name")
      .eq("group_id", membership.group_id)
      .eq("active", true)
      .order("name"),
    supabase.from("profiles").select("full_name, avatar_path").eq("id", user.id).maybeSingle(),
  ]);

  if (companiesError) throw companiesError;
  const companies = (companiesData ?? []) as CompanyOption[];
  const profile = profileData as { full_name?: string; avatar_path?: string | null } | null;
  const avatarPath = profile?.avatar_path ?? null;
  const avatarUrl = avatarPath
    ? supabase.storage.from("profile-avatars").getPublicUrl(avatarPath).data.publicUrl
    : "";

  return {
    groupId: membership.group_id,
    groupName: group.name,
    financeContactName: group.finance_contact_name ?? "",
    financeContactPhone: group.finance_contact_phone ?? "",
    reminderMessageTemplate: group.reminder_message_template ?? "",
    role: membership.role,
    companies,
    userId: user.id,
    userName:
      profile?.full_name?.trim() ||
      String(user.user_metadata.full_name ?? "").trim() ||
      user.email?.split("@")[0] ||
      "Usuário",
    userEmail: user.email ?? "",
    avatarPath,
    avatarUrl,
  };
}

export async function updateFinanceContact(
  supabase: SupabaseClient,
  groupId: string,
  input: FinanceContactInput,
) {
  const { error } = await supabase
    .from("business_groups")
    .update({
      finance_contact_name: input.name,
      finance_contact_phone: input.phone,
      reminder_message_template: input.messageTemplate,
    })
    .eq("id", groupId);

  if (error) throw error;
}

export async function updateGroupName(supabase: SupabaseClient, groupId: string, name: string) {
  const { error } = await supabase.from("business_groups").update({ name }).eq("id", groupId);
  if (error) throw error;
}

export async function updateProfileSettings(
  supabase: SupabaseClient,
  workspace: WorkspaceContext,
  input: ProfileSettingsInput,
) {
  let avatarPath = workspace.avatarPath;

  if (input.avatarFile) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.avatarFile.type)) {
      throw new Error("Use uma foto JPG, PNG ou WebP.");
    }
    if (input.avatarFile.size > 3 * 1024 * 1024) {
      throw new Error("A foto deve ter no máximo 3 MB.");
    }

    avatarPath = `${workspace.userId}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from("profile-avatars")
      .upload(avatarPath, input.avatarFile, { upsert: true, contentType: input.avatarFile.type });
    if (uploadError) throw uploadError;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: input.name, avatar_path: avatarPath })
    .eq("id", workspace.userId);
  if (error) throw error;

  const avatarUrl = avatarPath
    ? `${supabase.storage.from("profile-avatars").getPublicUrl(avatarPath).data.publicUrl}?v=${Date.now()}`
    : "";
  return { avatarPath, avatarUrl };
}

export async function loadBills(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from("bills")
    .select("id, supplier, supplier_tax_id, category, company_id, amount_cents, due_date, status, late_fee_bps, monthly_interest_bps, protest_days, barcode, cost_center, notes, approval_status, paid_at, created_at, attachment_path, companies(name)")
    .eq("group_id", groupId)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as DatabaseBill[]).map(mapDatabaseBill);
}

export async function createWorkspace(
  supabase: SupabaseClient,
  groupName: string,
  companyName: string,
) {
  const { error } = await supabase.rpc("create_group_with_admin", {
    p_group_name: groupName,
    p_company_name: companyName,
  });
  if (error) throw error;
}

export async function insertBill(
  supabase: SupabaseClient,
  workspace: WorkspaceContext,
  input: NewBillInput,
) {
  const { data, error } = await supabase
    .from("bills")
    .insert({
      group_id: workspace.groupId,
      company_id: input.companyId,
      supplier: input.supplier,
      supplier_tax_id: input.supplierTaxId || null,
      category: input.category,
      amount_cents: input.amountCents,
      due_date: input.dueDate,
      late_fee_bps: Math.round(input.lateFeePercent * 100),
      monthly_interest_bps: Math.round(input.monthlyInterestPercent * 100),
      protest_days: input.protestDays,
      barcode: input.barcode || null,
      cost_center: input.costCenter || null,
      notes: input.notes || null,
      created_by: workspace.userId,
    })
    .select("id, supplier, supplier_tax_id, category, company_id, amount_cents, due_date, status, late_fee_bps, monthly_interest_bps, protest_days, barcode, cost_center, notes, approval_status, paid_at, created_at, attachment_path, companies(name)")
    .single();

  if (error) throw error;
  return mapDatabaseBill(data as unknown as DatabaseBill);
}

export async function uploadBillPdf(
  supabase: SupabaseClient,
  workspace: WorkspaceContext,
  bill: Bill,
  file: File,
) {
  if (file.type !== "application/pdf") throw new Error("Selecione um arquivo PDF.");
  if (file.size > 10 * 1024 * 1024) throw new Error("O PDF deve ter no máximo 10 MB.");

  const attachmentPath = `${workspace.groupId}/${bill.id}/boleto.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("bill-documents")
    .upload(attachmentPath, file, { upsert: true, contentType: "application/pdf" });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .from("bills")
    .update({ attachment_path: attachmentPath })
    .eq("id", bill.id);
  if (updateError) throw updateError;

  return { ...bill, attachmentPath };
}

export async function createBillPdfSignedUrl(supabase: SupabaseClient, attachmentPath: string) {
  const { data, error } = await supabase.storage.from("bill-documents").createSignedUrl(attachmentPath, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function markBillPaid(supabase: SupabaseClient, billId: string) {
  const { error } = await supabase
    .from("bills")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", billId);
  if (error) throw error;
}

export async function deleteBill(supabase: SupabaseClient, bill: Bill) {
  const { error } = await supabase.from("bills").delete().eq("id", bill.id);
  if (error) throw error;

  if (bill.attachmentPath && !bill.attachmentPath.startsWith("local:")) {
    const { error: storageError } = await supabase.storage.from("bill-documents").remove([bill.attachmentPath]);
    if (storageError) console.warn("Boleto excluído, mas o PDF não pôde ser removido", storageError);
  }
}

export async function persistReminder(
  supabase: SupabaseClient,
  workspace: WorkspaceContext,
  bill: Bill,
  message: string,
) {
  const { error: reminderError } = await supabase.from("reminders").insert({
    group_id: workspace.groupId,
    bill_id: bill.id,
    sent_by: workspace.userId,
    recipient_name: workspace.financeContactName,
    recipient_phone: workspace.financeContactPhone,
    message,
    status: "opened",
  });
  if (reminderError) throw reminderError;

  const { error: billError } = await supabase
    .from("bills")
    .update({ status: "reminder_sent" })
    .eq("id", bill.id);
  if (billError) throw billError;
}
