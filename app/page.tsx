"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  calcularJurosBanco,
  formatarCentavosEmReal,
  obterDataAtualISO,
} from "../lib/calculo-juros";
import {
  calculateCalendarDays,
  createLocalCheck,
  deleteCheck,
  describeCheckDate,
  formatDateLong,
  insertCheck,
  loadChecks,
  markCheckCompensated,
  persistCheckReminder,
  updateCheck,
  updateLocalCheck,
  withCheckStatus,
  type CheckRecord,
  type NewCheckInput,
} from "../lib/check-data";
import {
  createPaymentReceiptSignedUrl,
  createBillPdfSignedUrl,
  createLocalBill,
  createWorkspace,
  deleteBill,
  insertBill,
  loadBills,
  loadWorkspace,
  markBillPaid,
  persistBulkReminder,
  persistReminder,
  roleLabel,
  updateFinanceContact,
  updateGroupName,
  updateProfileSettings,
  uploadBillPdf,
  uploadPaymentReceipt,
  type Bill,
  type CompanyOption,
  type FinanceContactInput,
  type NewBillInput,
  type ProfileSettingsInput,
  type WorkspaceContext,
} from "../lib/finance-data";
import { canMarkBillPaid, validatePaymentReceipt } from "../lib/payment-receipt";
import { formatCnpj, normalizeCnpj, parseBillPdfText } from "../lib/boleto-parser";
import { readPdfText } from "../lib/pdf-reader";
import { exportBillsToExcel } from "../lib/bill-export";
import { groupBillsByDueDate } from "../lib/bill-groups";
import { moneyInputFromCents, parseBrazilianMoney } from "../lib/money-input";
import {
  DEFAULT_REMINDER_TEMPLATE,
  formatWhatsAppPhone,
  isValidWhatsAppPhone,
  normalizeWhatsAppPhone,
  renderBulkReminderMessage,
  renderReminderTemplate,
} from "../lib/whatsapp";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { getSupabasePublicConfig } from "../lib/supabase/config";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  FileSpreadsheet,
  Gavel,
  Landmark,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Percent,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Trash2,
  LogOut,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

type View = "dashboard" | "boletos" | "cheques" | "juros" | "lembretes" | "relatorios" | "configuracoes";

const navItems = [
  { id: "dashboard" as View, label: "Visão geral", icon: LayoutDashboard },
  { id: "boletos" as View, label: "Boletos", icon: WalletCards },
  { id: "cheques" as View, label: "Cheques", icon: Banknote },
  { id: "juros" as View, label: "Calculadora de juros", icon: Calculator },
  { id: "lembretes" as View, label: "Lembretes", icon: MessageCircle },
  { id: "relatorios" as View, label: "Relatórios", icon: CircleDollarSign },
  { id: "configuracoes" as View, label: "Configurações", icon: Settings },
];

const initialBills: Bill[] = [];

const demoCompanies: CompanyOption[] = [
  { id: "demo-company", name: "Sua empresa" },
];

const demoWorkspace: WorkspaceContext = {
  groupId: "demo-group",
  groupName: "Seu grupo",
  financeContactName: "",
  financeContactPhone: "",
  reminderMessageTemplate: DEFAULT_REMINDER_TEMPLATE,
  role: "admin",
  companies: demoCompanies,
  userId: "demo-user",
  userName: "Usuário",
  userEmail: "",
  avatarPath: null,
  avatarUrl: "",
};
const initialChecks: CheckRecord[] = [];

function StatusBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`status status-${tone}`}><i />{children}</span>;
}

function Logo() {
  return (
    <div className="brand">
      <div className="brand-mark"><span>N</span><i /></div>
      <div><strong>Nexo</strong><small>Gestão financeira</small></div>
    </div>
  );
}

function MiniAvatar({ initials, color = "blue" }: { initials: string; color?: string }) {
  return <span className={`mini-avatar avatar-${color}`}>{initials}</span>;
}

function ProfileAvatar({ name, url, size = "small" }: { name: string; url: string; size?: "small" | "large" }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US";
  return <span className={`profile-avatar profile-avatar-${size}`} role={url ? "img" : undefined} aria-label={url ? `Foto de ${name}` : undefined} style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}>{url ? null : initials}</span>;
}

function calcularEncargosDoBoleto(bill: Bill, dataCalculo = obterDataAtualISO()) {
  return calcularJurosBanco({
    valorOriginalCentavos: bill.amountCents,
    dataVencimento: bill.dueDate,
    dataCalculo,
    multaPercentual: bill.lateFeePercent,
    jurosMensalPercentual: bill.monthlyInterestPercent,
  });
}

function LoadingScreen() {
  return <main className="gate-screen"><section className="gate-card loading-card"><Logo/><span className="loading-spinner"/><h1>Carregando seu financeiro</h1><p>Estamos preparando os boletos do seu grupo.</p></section></main>;
}

function AuthScreen({ supabase, onAuthenticated }: { supabase: SupabaseClient; onAuthenticated: (user: User) => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await onAuthenticated(data.user);
        return;
      }

      const redirectTo = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      if (data.session && data.user) {
        await onAuthenticated(data.user);
      } else {
        setMessage("Cadastro criado. Verifique seu e-mail para confirmar a conta.");
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Não foi possível autenticar.";
      setMessage(text);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="gate-screen">
      <section className="gate-card auth-card">
        <Logo/>
        <div className="gate-heading"><small>ACESSO SEGURO</small><h1>{mode === "login" ? "Entre na sua conta" : "Crie sua conta"}</h1><p>Controle os boletos de todas as empresas do seu grupo.</p></div>
        <form onSubmit={submitAuth}>
          {mode === "signup" && <label><span>Nome completo</span><input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>}
          <label><span>E-mail</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label><span>Senha</span><input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          {message && <div className="gate-message"><AlertCircle size={15}/><span>{message}</span></div>}
          <button className="primary-button gate-submit" disabled={submitting}>{submitting ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</button>
        </form>
        <button className="gate-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}</button>
      </section>
    </main>
  );
}

function OnboardingScreen({ supabase, user, onReady }: { supabase: SupabaseClient; user: User; onReady: () => Promise<void> }) {
  const [groupName, setGroupName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await createWorkspace(supabase, groupName, companyName);
      await onReady();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar o grupo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="gate-screen">
      <section className="gate-card onboarding-card">
        <Logo/>
        <div className="gate-heading"><small>PRIMEIRA CONFIGURAÇÃO</small><h1>Crie seu grupo empresarial</h1><p>Você será o administrador inicial e poderá adicionar filiais e usuários depois.</p></div>
        <form onSubmit={submitWorkspace}>
          <label><span>Nome do grupo</span><input required minLength={2} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Nome do grupo empresarial" /></label>
          <label><span>Nome da empresa matriz</span><input required minLength={2} value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Nome da empresa matriz" /></label>
          {message && <div className="gate-message"><AlertCircle size={15}/><span>{message}</span></div>}
          <button className="primary-button gate-submit" disabled={submitting}>{submitting ? "Criando..." : "Criar grupo e continuar"}</button>
        </form>
        <small className="signed-email">Conta: {user.email}</small>
      </section>
    </main>
  );
}

export default function Home() {
  const supabaseConfigured = getSupabasePublicConfig().configured;
  const [supabase] = useState<SupabaseClient | null>(() =>
    supabaseConfigured ? createSupabaseBrowserClient() : null,
  );
  const [appState, setAppState] = useState<"loading" | "auth" | "onboarding" | "ready" | "demo">(
    supabaseConfigured ? "loading" : "demo",
  );
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceContext>(demoWorkspace);
  const [active, setActive] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newBillOpen, setNewBillOpen] = useState(false);
  const [newCheckOpen, setNewCheckOpen] = useState(false);
  const [editingCheck, setEditingCheck] = useState<CheckRecord | null>(null);
  const [reminderBill, setReminderBill] = useState<Bill | null>(null);
  const [bulkReminderBills, setBulkReminderBills] = useState<Bill[]>([]);
  const [reminderCheck, setReminderCheck] = useState<CheckRecord | null>(null);
  const [detailBill, setDetailBill] = useState<Bill | null>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [bills, setBills] = useState<Bill[]>(supabaseConfigured ? [] : initialBills);
  const [checks, setChecks] = useState<CheckRecord[]>(supabaseConfigured ? [] : initialChecks);

  const initializeForUser = useCallback(async (user: User) => {
    if (!supabase) return;
    setAppState("loading");
    setAuthUser(user);

    try {
      const nextWorkspace = await loadWorkspace(supabase, user);
      if (!nextWorkspace) {
        setAppState("onboarding");
        return;
      }

      const [nextBills, nextChecks] = await Promise.all([
        loadBills(supabase, nextWorkspace.groupId),
        loadChecks(supabase, nextWorkspace.groupId),
      ]);
      setWorkspace(nextWorkspace);
      setBills(nextBills);
      setChecks(nextChecks);
      setAppState("ready");
    } catch (error) {
      console.error("Falha ao carregar dados do Supabase", error);
      setAppState("auth");
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let activeSubscription = true;

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!activeSubscription) return;
      if (error || !data.user) {
        setAppState("auth");
        return;
      }
      void initializeForUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!activeSubscription) return;
      if (event === "SIGNED_OUT" || !session?.user) {
        setAuthUser(null);
        setBills([]);
        setChecks([]);
        setAppState("auth");
        return;
      }
      if (event === "SIGNED_IN") {
        queueMicrotask(() => void initializeForUser(session.user));
      }
    });

    return () => {
      activeSubscription = false;
      listener.subscription.unsubscribe();
    };
  }, [initializeForUser, supabase]);

  const visibleBills = useMemo(() => {
    const query = search.toLowerCase();
    return bills.filter((bill) => {
      const matchesQuery = `${bill.supplier} ${bill.supplierTaxId} ${bill.category} ${bill.company}`.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "Todos" || bill.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [search, statusFilter, bills]);

  function goTo(view: View) {
    setActive(view);
    setSidebarOpen(false);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function openNewBill() {
    if (workspace.role === "aprovador") {
      showToast("O perfil aprovador não pode cadastrar boletos");
      return;
    }
    setNewBillOpen(true);
  }

  function openNewCheck() {
    if (workspace.role === "aprovador") {
      showToast("O perfil aprovador não pode cadastrar cheques");
      return;
    }
    setNewCheckOpen(true);
  }

  function openReminder(bill: Bill) {
    if (workspace.role !== "admin") {
      showToast("Somente o administrador pode preparar lembretes");
      return;
    }
    if (!workspace.financeContactName || !isValidWhatsAppPhone(workspace.financeContactPhone)) {
      setActive("configuracoes");
      showToast("Configure o responsável e o WhatsApp antes de enviar lembretes");
      return;
    }
    setReminderBill(bill);
  }

  function openBulkReminder() {
    if (workspace.role !== "admin") {
      showToast("Somente o administrador pode preparar lembretes");
      return;
    }
    if (!workspace.financeContactName || !isValidWhatsAppPhone(workspace.financeContactPhone)) {
      setActive("configuracoes");
      showToast("Configure o responsável e o WhatsApp antes de enviar lembretes");
      return;
    }

    const selected = bills.filter((bill) =>
      selectedBillIds.includes(bill.id) && !["paid", "cancelled"].includes(bill.databaseStatus),
    );
    if (!selected.length) {
      showToast("Selecione pelo menos um boleto em aberto");
      return;
    }
    setBulkReminderBills(selected);
  }

  function openCheckReminder(check: CheckRecord) {
    if (workspace.role !== "admin") {
      showToast("Somente o administrador pode preparar lembretes");
      return;
    }
    if (!workspace.financeContactName || !isValidWhatsAppPhone(workspace.financeContactPhone)) {
      setActive("configuracoes");
      showToast("Configure o responsável e o WhatsApp antes de enviar lembretes");
      return;
    }
    setReminderCheck(check);
  }

  function sendReminder(bill: Bill, message: string) {
    window.open(`https://wa.me/${normalizeWhatsAppPhone(workspace.financeContactPhone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setBills((current) => current.map((item) => item.id === bill.id ? { ...item, status: "Lembrete enviado", databaseStatus: "reminder_sent", tone: "purple" } : item));
    setReminderBill(null);
    showToast("Lembrete preparado no WhatsApp");

    if (supabase && appState === "ready") {
      void persistReminder(supabase, workspace, bill, message).catch((error) => {
        console.error("Falha ao salvar histórico do lembrete", error);
        showToast("WhatsApp aberto, mas o histórico não foi salvo");
      });
    }
  }

  function sendBulkReminder(selectedBills: Bill[], message: string) {
    window.open(`https://wa.me/${normalizeWhatsAppPhone(workspace.financeContactPhone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    const selectedIds = new Set(selectedBills.map((bill) => bill.id));
    setBills((current) => current.map((item) => selectedIds.has(item.id) ? { ...item, status: "Lembrete enviado", databaseStatus: "reminder_sent", tone: "purple" } : item));
    setBulkReminderBills([]);
    setSelectedBillIds([]);
    showToast(`${selectedBills.length} lembrete${selectedBills.length === 1 ? "" : "s"} preparado${selectedBills.length === 1 ? "" : "s"} no WhatsApp`);

    if (supabase && appState === "ready") {
      void persistBulkReminder(supabase, workspace, selectedBills, message).catch((error) => {
        console.error("Falha ao salvar histórico dos lembretes", error);
        showToast("WhatsApp aberto, mas o histórico não foi salvo");
      });
    }
  }

  async function saveBill(input: NewBillInput) {
    try {
      let next = supabase && appState === "ready"
        ? await insertBill(supabase, workspace, input)
        : createLocalBill(input);
      let pdfUploadFailed = false;

      if (supabase && appState === "ready" && input.pdfFile) {
        try {
          next = await uploadBillPdf(supabase, workspace, next, input.pdfFile);
        } catch (error) {
          pdfUploadFailed = true;
          console.error("Falha ao armazenar PDF do boleto", error);
        }
      }

      setBills((current) => [next, ...current]);
      setNewBillOpen(false);
      showToast(pdfUploadFailed ? "Boleto salvo, mas não foi possível anexar o PDF" : "Boleto e dados adicionados com sucesso");
    } catch (error) {
      console.error("Falha ao salvar boleto", error);
      showToast("Não foi possível salvar o boleto");
    }
  }

  async function saveCheck(input: NewCheckInput) {
    try {
      const next = supabase && appState === "ready"
        ? await insertCheck(supabase, workspace, input)
        : createLocalCheck(input);
      setChecks((current) => [next, ...current]);
      setNewCheckOpen(false);
      showToast("Cheque adicionado com sucesso");
    } catch (error) {
      console.error("Falha ao salvar cheque", error);
      showToast("Não foi possível salvar o cheque");
    }
  }

  async function saveCheckChanges(check: CheckRecord, input: NewCheckInput) {
    try {
      const updated = supabase && appState === "ready"
        ? await updateCheck(supabase, check.id, input)
        : updateLocalCheck(check, input);
      setChecks((current) => current.map((item) => item.id === check.id ? updated : item));
      setEditingCheck(null);
      showToast("Cheque atualizado com sucesso");
    } catch (error) {
      console.error("Falha ao atualizar cheque", error);
      showToast("Não foi possível atualizar o cheque");
    }
  }

  function openEditCheck(check: CheckRecord) {
    if (workspace.role === "aprovador") {
      showToast("O perfil aprovador não pode alterar cheques");
      return;
    }
    setEditingCheck(check);
  }

  function sendCheckReminder(check: CheckRecord, message: string) {
    window.open(`https://wa.me/${normalizeWhatsAppPhone(workspace.financeContactPhone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setChecks((current) => current.map((item) => item.id === check.id ? withCheckStatus(item, "reminder_sent") : item));
    setReminderCheck(null);
    showToast("Lembrete do cheque preparado no WhatsApp");

    if (supabase && appState === "ready") {
      void persistCheckReminder(supabase, workspace, check, message).catch((error) => {
        console.error("Falha ao salvar histórico do cheque", error);
        showToast("WhatsApp aberto, mas o histórico não foi salvo");
      });
    }
  }

  async function handleCheckCompensated(check: CheckRecord) {
    try {
      if (supabase && appState === "ready") await markCheckCompensated(supabase, check.id);
      setChecks((current) => current.map((item) => item.id === check.id ? withCheckStatus(item, "compensated") : item));
      showToast("Cheque marcado como compensado");
    } catch (error) {
      console.error("Falha ao atualizar cheque", error);
      showToast("Não foi possível atualizar o cheque");
    }
  }

  async function handlePaid(bill: Bill) {
    if (!canMarkBillPaid(bill)) {
      showToast("Anexe o comprovante antes de marcar o boleto como pago");
      return;
    }

    try {
      if (supabase && appState === "ready") {
        await markBillPaid(supabase, bill.id);
      }
      setBills((current) => current.map((item) => item.id === bill.id ? { ...item, status: "Pago", databaseStatus: "paid", tone: "success", paidAt: new Date().toISOString() } : item));
      setSelectedBillIds((current) => current.filter((id) => id !== bill.id));
      setDetailBill(null);
      showToast("Boleto marcado como pago");
    } catch (error) {
      console.error("Falha ao atualizar boleto", error);
      showToast(error instanceof Error ? error.message : "Não foi possível atualizar o boleto");
    }
  }

  async function handlePaymentReceipt(bill: Bill, file: File) {
    if (workspace.role === "aprovador") {
      showToast("O perfil aprovador não pode anexar comprovantes");
      return;
    }

    try {
      validatePaymentReceipt(file);
      const uploadedAt = new Date().toISOString();
      const next = supabase && appState === "ready"
        ? await uploadPaymentReceipt(supabase, workspace, bill, file)
        : {
            ...bill,
            paymentReceiptPath: `local:${file.name}`,
            paymentReceiptName: file.name,
            paymentReceiptMimeType: file.type,
            paymentReceiptUploadedAt: uploadedAt,
          };
      setBills((current) => current.map((item) => item.id === bill.id ? next : item));
      setDetailBill(next);
      showToast("Comprovante anexado. O pagamento foi liberado");
    } catch (error) {
      console.error("Falha ao anexar comprovante", error);
      showToast(error instanceof Error ? error.message : "Não foi possível anexar o comprovante");
    }
  }

  async function handleDeleteBill(bill: Bill) {
    if (workspace.role !== "admin") {
      showToast("Somente o administrador pode excluir boletos");
      return;
    }
    if (!window.confirm(`Excluir definitivamente o boleto de ${bill.supplier}, no valor de ${bill.value}?`)) return;

    try {
      if (supabase && appState === "ready") await deleteBill(supabase, bill);
      setBills((current) => current.filter((item) => item.id !== bill.id));
      setSelectedBillIds((current) => current.filter((id) => id !== bill.id));
      setDetailBill(null);
      showToast("Boleto removido com sucesso");
    } catch (error) {
      console.error("Falha ao excluir boleto", error);
      showToast("Não foi possível excluir o boleto");
    }
  }

  async function handleDeleteCheck(check: CheckRecord) {
    if (workspace.role !== "admin") {
      showToast("Somente o administrador pode excluir cheques");
      return;
    }
    if (!window.confirm(`Excluir definitivamente o cheque nº ${check.checkNumber}, no valor de ${check.value}?`)) return;

    try {
      if (supabase && appState === "ready") await deleteCheck(supabase, check.id);
      setChecks((current) => current.filter((item) => item.id !== check.id));
      showToast("Cheque removido com sucesso");
    } catch (error) {
      console.error("Falha ao excluir cheque", error);
      showToast("Não foi possível excluir o cheque");
    }
  }

  async function saveFinanceSettings(input: FinanceContactInput) {
    if (workspace.role !== "admin") {
      showToast("Somente o administrador pode alterar o contato");
      return;
    }
    if (!input.name.trim() || !isValidWhatsAppPhone(input.phone)) {
      showToast("Informe um nome e um WhatsApp válido com DDD");
      return;
    }

    const normalizedInput = {
      name: input.name.trim(),
      phone: normalizeWhatsAppPhone(input.phone),
      messageTemplate: input.messageTemplate.trim() || DEFAULT_REMINDER_TEMPLATE,
    };

    try {
      if (supabase && appState === "ready") {
        await updateFinanceContact(supabase, workspace.groupId, normalizedInput);
      }
      setWorkspace((current) => ({
        ...current,
        financeContactName: normalizedInput.name,
        financeContactPhone: normalizedInput.phone,
        reminderMessageTemplate: normalizedInput.messageTemplate,
      }));
      showToast("Contato do WhatsApp salvo com sucesso");
    } catch (error) {
      console.error("Falha ao salvar contato do WhatsApp", error);
      showToast("Não foi possível salvar. Execute a nova migração no Supabase.");
    }
  }

  async function saveGroupSettings(name: string) {
    const normalizedName = name.trim();
    if (workspace.role !== "admin" || normalizedName.length < 2) {
      showToast("Somente o administrador pode alterar o nome do grupo");
      return;
    }
    try {
      if (supabase && appState === "ready") await updateGroupName(supabase, workspace.groupId, normalizedName);
      setWorkspace((current) => ({ ...current, groupName: normalizedName }));
      showToast("Nome do grupo atualizado");
    } catch (error) {
      console.error("Falha ao atualizar grupo", error);
      showToast("Não foi possível atualizar o nome do grupo");
    }
  }

  async function saveProfile(input: ProfileSettingsInput) {
    const normalizedName = input.name.trim();
    if (normalizedName.length < 2) {
      showToast("Informe um nome de perfil válido");
      return;
    }
    try {
      let result = { avatarPath: workspace.avatarPath, avatarUrl: workspace.avatarUrl };
      if (supabase && appState === "ready") {
        result = await updateProfileSettings(supabase, workspace, { ...input, name: normalizedName });
      } else if (input.avatarFile) {
        result = { avatarPath: `local:${input.avatarFile.name}`, avatarUrl: URL.createObjectURL(input.avatarFile) };
      }
      setWorkspace((current) => ({ ...current, userName: normalizedName, ...result }));
      showToast("Perfil atualizado com sucesso");
    } catch (error) {
      console.error("Falha ao atualizar perfil", error);
      showToast(error instanceof Error ? error.message : "Não foi possível atualizar o perfil");
    }
  }

  async function openBillPdf(bill: Bill) {
    if (!bill.attachmentPath) return;
    if (bill.attachmentPath.startsWith("local:")) {
      showToast("No modo demonstração, o PDF não fica armazenado");
      return;
    }
    if (!supabase) return;

    const popup = window.open("about:blank", "_blank");
    try {
      const url = await createBillPdfSignedUrl(supabase, bill.attachmentPath);
      if (popup) popup.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      popup?.close();
      console.error("Falha ao abrir PDF", error);
      showToast("Não foi possível abrir o PDF do boleto");
    }
  }

  async function openPaymentReceipt(bill: Bill) {
    if (!bill.paymentReceiptPath) return;
    if (bill.paymentReceiptPath.startsWith("local:")) {
      showToast("No modo demonstração, o comprovante não fica armazenado");
      return;
    }
    if (!supabase) return;

    const popup = window.open("about:blank", "_blank");
    try {
      const url = await createPaymentReceiptSignedUrl(supabase, bill.paymentReceiptPath);
      if (popup) popup.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      popup?.close();
      console.error("Falha ao abrir comprovante", error);
      showToast("Não foi possível abrir o comprovante");
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (appState === "loading") {
    return <LoadingScreen />;
  }

  if (appState === "auth" && supabase) {
    return <AuthScreen supabase={supabase} onAuthenticated={initializeForUser} />;
  }

  if (appState === "onboarding" && supabase && authUser) {
    return <OnboardingScreen supabase={supabase} user={authUser} onReady={() => initializeForUser(authUser)} />;
  }

  const paidPercentage = bills.length
    ? Math.round((bills.filter((bill) => bill.databaseStatus === "paid").length / bills.length) * 100)
    : 0;
  const reminderCount = bills.filter((bill) => bill.databaseStatus === "reminder_sent").length
    + checks.filter((check) => check.databaseStatus === "reminder_sent").length;

  return (
    <main className="app-shell">
      {sidebarOpen && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Logo /><button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={20} /></button></div>
        <div className="group-switcher"><span className="group-icon"><Building2 size={18} /></span><div><small>Grupo empresarial</small><strong>{workspace.groupName}</strong></div><ChevronDown size={16} /></div>
        <nav aria-label="Navegação principal">
          <p className="nav-label">Menu</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const count = item.id === "boletos" ? bills.length : item.id === "cheques" ? checks.length : item.id === "lembretes" ? reminderCount : undefined;
            return <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => goTo(item.id)}><Icon size={19} strokeWidth={1.9} /><span>{item.label}</span>{count ? <em>{count}</em> : null}</button>;
          })}
        </nav>
        <div className="sidebar-insight"><span><Sparkles size={17} /></span><strong>Acompanhamento</strong><p>{bills.length ? `${paidPercentage}% dos boletos cadastrados estão pagos.` : "Cadastre o primeiro boleto para acompanhar os pagamentos."}</p><div><i style={{ width: `${paidPercentage}%` }} /></div></div>
        <div className="user-card"><ProfileAvatar name={workspace.userName} url={workspace.avatarUrl} /><div><strong>{workspace.userName}</strong><small>{roleLabel(workspace.role)}</small></div>{supabase ? <button className="user-signout" onClick={() => void signOut()} aria-label="Sair"><LogOut size={17}/></button> : <span className="demo-dot" title="Modo demonstração" />}</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div className="crumb"><span>Financeiro</span><ChevronRight size={14} /><strong>{navItems.find((item) => item.id === active)?.label}</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notificações" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={20} /><i /></button>
            <button className="primary-button" onClick={active === "cheques" ? openNewCheck : openNewBill}><Plus size={18} /> {active === "cheques" ? "Novo cheque" : "Novo boleto"}</button>
          </div>
        </header>

        {notificationsOpen && <NotificationPanel bills={bills} onClose={() => setNotificationsOpen(false)} onRemind={(bill) => { openReminder(bill); setNotificationsOpen(false); }} />}

        <div className="content">
          {appState === "demo" && <div className="demo-banner"><AlertCircle size={16}/><span>Modo demonstração: configure o Supabase para ativar login e salvar os dados.</span></div>}
          {active === "dashboard" && <Dashboard bills={bills} userName={workspace.userName} onSeeBills={() => setActive("boletos")} onRemind={openReminder} onDetail={setDetailBill} />}
          {active === "boletos" && <BillsPage bills={visibleBills} search={search} onSearch={setSearch} statusFilter={statusFilter} onFilter={setStatusFilter} onRemind={openReminder} onBulkRemind={openBulkReminder} selectedBillIds={selectedBillIds} onSelectionChange={setSelectedBillIds} onDetail={setDetailBill} onNew={openNewBill} canDelete={workspace.role === "admin"} canBulkRemind={workspace.role === "admin"} onDelete={(bill) => void handleDeleteBill(bill)} />}
          {active === "cheques" && <ChecksPage checks={checks} onNew={openNewCheck} onRemind={openCheckReminder} onCompensated={(check) => void handleCheckCompensated(check)} canEdit={workspace.role !== "aprovador"} onEdit={openEditCheck} canDelete={workspace.role === "admin"} onDelete={(check) => void handleDeleteCheck(check)} />}
          {active === "juros" && <InterestCalculatorPage />}
          {active === "lembretes" && <RemindersPage bills={bills} checks={checks} workspace={workspace} onRemind={() => bills[0] ? openReminder(bills[0]) : showToast("Cadastre um boleto antes de criar o lembrete")} onEditContact={() => setActive("configuracoes")} />}
          {active === "relatorios" && <ReportsPage bills={bills} workspace={workspace} />}
          {active === "configuracoes" && <SettingsPage workspace={workspace} onSaveContact={saveFinanceSettings} onSaveGroup={saveGroupSettings} onSaveProfile={saveProfile} />}
        </div>
      </section>

      {newBillOpen && <NewBillModal companies={workspace.companies} onClose={() => setNewBillOpen(false)} onSave={saveBill} />}
      {newCheckOpen && <NewCheckModal companies={workspace.companies} onClose={() => setNewCheckOpen(false)} onSave={saveCheck} />}
      {editingCheck && <NewCheckModal check={editingCheck} companies={workspace.companies} onClose={() => setEditingCheck(null)} onSave={(input) => saveCheckChanges(editingCheck, input)} />}
      {reminderBill && <ReminderModal bill={reminderBill} workspace={workspace} onClose={() => setReminderBill(null)} onSend={(message) => sendReminder(reminderBill, message)} />}
      {bulkReminderBills.length > 0 && <BulkReminderModal bills={bulkReminderBills} workspace={workspace} onClose={() => setBulkReminderBills([])} onSend={(message) => sendBulkReminder(bulkReminderBills, message)} />}
      {reminderCheck && <CheckReminderModal check={reminderCheck} workspace={workspace} onClose={() => setReminderCheck(null)} onSend={(message) => sendCheckReminder(reminderCheck, message)} />}
      {detailBill && <BillDetail bill={detailBill} workspace={workspace} onClose={() => setDetailBill(null)} onRemind={() => { setDetailBill(null); openReminder(detailBill); }} onPaid={() => void handlePaid(detailBill)} onDelete={() => void handleDeleteBill(detailBill)} onOpenPdf={() => void openBillPdf(detailBill)} onUploadReceipt={(file) => handlePaymentReceipt(detailBill, file)} onOpenReceipt={() => void openPaymentReceipt(detailBill)} />}
      {toast && <div className="toast"><CheckCircle2 size={18} /><span>{toast}</span></div>}
    </main>
  );
}

function NotificationPanel({ bills, onClose, onRemind }: { bills: Bill[]; onClose: () => void; onRemind: (bill: Bill) => void }) {
  const alerts = bills.filter((bill) => bill.tone === "danger" || bill.tone === "warning" || bill.tone === "yellow").slice(0, 3);
  return (
    <div className="notification-panel">
      <div className="panel-head"><div><small>Central de alertas</small><h3>{alerts.length ? `${alerts.length} boleto${alerts.length === 1 ? "" : "s"} precisa${alerts.length === 1 ? "" : "m"} de atenção` : "Nenhum alerta pendente"}</h3></div><button onClick={onClose} aria-label="Fechar alertas"><X size={18} /></button></div>
      {alerts.map((bill) => <article key={bill.id}><span className={`alert-icon ${bill.tone === "danger" ? "danger" : "warning"}`}>{bill.tone === "danger" ? <AlertCircle size={18}/> : <Clock3 size={18}/>}</span><div><strong>{bill.supplier} • {bill.status}</strong><p>{bill.value} • {bill.company}</p><button onClick={() => onRemind(bill)}>Lembrar financeiro</button></div><small>{bill.tone === "danger" ? "urgente" : "agora"}</small></article>)}
      <button className="panel-link">Ver todos os alertas</button>
    </div>
  );
}

function Dashboard({ bills, userName, onSeeBills, onRemind, onDetail }: { bills: Bill[]; userName: string; onSeeBills: () => void; onRemind: (bill: Bill) => void; onDetail: (bill: Bill) => void }) {
  const priorities = bills.filter((bill) => bill.databaseStatus !== "paid").slice(0, 3);
  const totalOpen = bills.filter((bill) => bill.databaseStatus !== "paid").reduce((total, bill) => total + bill.amountCents, 0);
  const overdue = bills.filter((bill) => bill.tone === "danger");
  const upcoming = bills.filter((bill) => {
    const days = calculateCalendarDays(bill.dueDate);
    return bill.databaseStatus !== "paid" && days >= 0 && days <= 7;
  });
  const paid = bills.filter((bill) => bill.databaseStatus === "paid");
  const totalRegistered = bills.reduce((total, bill) => total + bill.amountCents, 0);
  const periodLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());
  return (
    <>
      <section className="page-intro">
        <div><p>Gestão financeira</p><h1>Olá, {userName.split(" ")[0]} <span>👋</span></h1><h2>Veja os boletos que precisam da sua atenção hoje.</h2></div>
        <button className="period-button"><CalendarDays size={17} /> {periodLabel} <ChevronDown size={15} /></button>
      </section>

      {priorities.length > 0 ? <section className="attention-banner">
        <div className="banner-icon"><Bell size={21} /></div>
        <div><small>EVITE ATRASOS</small><h3>{priorities.length} boleto{priorities.length === 1 ? " precisa" : "s precisam"} de atenção</h3><p>Avise o financeiro pelo WhatsApp antes do vencimento.</p></div>
        <div className="banner-avatars">{priorities.slice(0, 2).map((bill) => <MiniAvatar key={bill.id} initials={bill.initials} color={bill.tone === "danger" ? "red" : "amber"}/>)}</div>
        <button onClick={() => onRemind(priorities[0])}><MessageCircle size={17}/> Enviar lembrete</button>
      </section> : <section className="attention-banner all-clear"><div className="banner-icon"><CheckCircle2 size={21}/></div><div><small>TUDO EM DIA</small><h3>Nenhum boleto pendente</h3><p>Cadastre um novo boleto para começar o acompanhamento.</p></div></section>}

      <section className="metric-grid">
        <article className="metric-card emphasis"><div className="metric-top"><span className="metric-icon green"><WalletCards size={20} /></span><StatusBadge tone="success"><ArrowDownRight size={12} /> controle</StatusBadge></div><p>Total a pagar</p><h3>{formatarCentavosEmReal(totalOpen)}</h3><small>{priorities.length} boleto{priorities.length === 1 ? "" : "s"} em aberto</small></article>
        <article className="metric-card"><div className="metric-top"><span className="metric-icon yellow"><Clock3 size={20} /></span><span className="metric-note">Próximos 7 dias</span></div><p>Próximos do vencimento</p><h3>{formatarCentavosEmReal(upcoming.reduce((total, bill) => total + bill.amountCents, 0))}</h3><small>{upcoming.length} boleto{upcoming.length === 1 ? "" : "s"} pendente{upcoming.length === 1 ? "" : "s"}</small></article>
        <article className="metric-card"><div className="metric-top"><span className="metric-icon red"><AlertCircle size={20} /></span><StatusBadge tone="danger"><ArrowUpRight size={12} /> atenção</StatusBadge></div><p>Boletos vencidos</p><h3>{formatarCentavosEmReal(overdue.reduce((total, bill) => total + bill.amountCents, 0))}</h3><small>{overdue.length} boleto{overdue.length === 1 ? "" : "s"} em atraso</small></article>
        <article className="metric-card"><div className="metric-top"><span className="metric-icon blue"><Check size={20} /></span><span className="metric-note">Cadastrados</span></div><p>Total pago</p><h3>{formatarCentavosEmReal(paid.reduce((total, bill) => total + bill.amountCents, 0))}</h3><small>{paid.length} pagamento{paid.length === 1 ? "" : "s"} concluído{paid.length === 1 ? "" : "s"}</small></article>
      </section>

      <section className="dashboard-grid">
        <article className="chart-card">
          <div className="card-heading"><div><p>Fluxo de pagamentos</p><h3>Resumo dos valores cadastrados</h3></div><button onClick={onSeeBills}>Ver boletos <ChevronRight size={14} /></button></div>
          {bills.length ? <><div className="chart-total"><strong>{formatarCentavosEmReal(totalRegistered)}</strong><StatusBadge tone="neutral">{bills.length} registro{bills.length === 1 ? "" : "s"}</StatusBadge><span>total cadastrado</span></div><div className="interest-breakdown"><div><span>Em aberto</span><strong>{formatarCentavosEmReal(totalOpen)}</strong></div><div><span>Pago</span><strong>{formatarCentavosEmReal(paid.reduce((total, bill) => total + bill.amountCents, 0))}</strong></div><div><span>Vencido</span><strong>{formatarCentavosEmReal(overdue.reduce((total, bill) => total + bill.amountCents, 0))}</strong></div></div></> : <div className="empty-state"><WalletCards size={28}/><h3>Nenhum valor cadastrado</h3><p>Adicione seu primeiro boleto para preencher este resumo.</p></div>}
        </article>
        <article className="priority-card">
          <div className="card-heading"><div><p>Ação necessária</p><h3>Prioridades de hoje</h3></div><button className="bare-button"><MoreHorizontal size={20} /></button></div>
          {priorities.map((bill) => <div className="priority-item" key={bill.id}><MiniAvatar initials={bill.initials} color={bill.tone === "danger" ? "red" : "amber"}/><div onClick={() => onDetail(bill)}><strong>{bill.supplier}</strong><small>{bill.value} • {bill.due}</small></div><button onClick={() => onRemind(bill)} aria-label={`Lembrar pagamento de ${bill.supplier}`}><MessageCircle size={16}/></button></div>)}
          {priorities.length === 0 && <div className="priority-empty"><CheckCircle2 size={24}/><p>Nenhum boleto exige ação agora.</p></div>}
          <button className="view-all" onClick={onSeeBills}>Ver todos os boletos <ChevronRight size={14}/></button>
        </article>
      </section>

      <section className="recent-card"><div className="card-heading"><div><p>Acompanhamento</p><h3>Boletos recentes</h3></div><button className="text-button" onClick={onSeeBills}>Ver todos <ChevronRight size={15} /></button></div><BillsTable rows={bills.slice(0, 4)} onRemind={onRemind} onDetail={onDetail} compact /></section>
    </>
  );
}

function BillsTable({ rows, onRemind, onDetail, onDelete, canDelete = false, compact = false, selectable = false, selectedBillIds = [], onSelectionChange }: { rows: Bill[]; onRemind: (bill: Bill) => void; onDetail: (bill: Bill) => void; onDelete?: (bill: Bill) => void; canDelete?: boolean; compact?: boolean; selectable?: boolean; selectedBillIds?: string[]; onSelectionChange?: (ids: string[]) => void }) {
  const eligibleIds = rows
    .filter((bill) => !["paid", "cancelled"].includes(bill.databaseStatus))
    .map((bill) => bill.id);
  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selectedBillIds.includes(id));

  function toggleBill(billId: string, checked: boolean) {
    if (!onSelectionChange) return;
    const next = new Set(selectedBillIds);
    if (checked) next.add(billId);
    else next.delete(billId);
    onSelectionChange([...next]);
  }

  function toggleAll(checked: boolean) {
    if (!onSelectionChange) return;
    const next = new Set(selectedBillIds);
    eligibleIds.forEach((id) => checked ? next.add(id) : next.delete(id));
    onSelectionChange([...next]);
  }

  return (
    <div className="table-wrap">
      <table><thead><tr>{selectable && <th className="select-column"><input type="checkbox" aria-label="Selecionar todos os boletos em aberto desta data" checked={allEligibleSelected} disabled={!eligibleIds.length} onChange={(event) => toggleAll(event.target.checked)}/></th>}<th>Fornecedor</th><th>Empresa / filial</th><th>Vencimento</th><th>Valor</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{rows.map((bill) => {
        const eligible = !["paid", "cancelled"].includes(bill.databaseStatus);
        return <tr key={bill.id} className={selectedBillIds.includes(bill.id) ? "selected-row" : ""} onClick={() => onDetail(bill)}>{selectable && <td className="select-column" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Selecionar boleto de ${bill.supplier}`} checked={selectedBillIds.includes(bill.id)} disabled={!eligible} title={!eligible ? "Boletos pagos ou cancelados não podem receber lembretes" : undefined} onChange={(event) => toggleBill(bill.id, event.target.checked)}/></td>}<td><div className="supplier-cell"><span>{bill.initials}</span><div><strong>{bill.supplier}</strong><small>{bill.category}</small></div></div></td><td>{bill.company}</td><td>{bill.due}</td><td><strong>{bill.value}</strong></td><td><StatusBadge tone={bill.tone}>{bill.status}</StatusBadge></td><td onClick={(event) => event.stopPropagation()}><div className="row-actions">{bill.status !== "Pago" && <button className="whatsapp-mini" onClick={() => onRemind(bill)}><MessageCircle size={14}/>{compact ? "" : "Lembrar"}</button>}{canDelete && !compact && onDelete && <button className="delete-row-button" onClick={() => onDelete(bill)} aria-label={`Excluir boleto de ${bill.supplier}`}><Trash2 size={14}/></button>}</div></td></tr>;
      })}</tbody></table>
      {rows.length === 0 && <div className="empty-state"><Search size={28}/><h3>Nenhum boleto encontrado</h3><p>{compact ? "Cadastre o primeiro boleto para iniciar o acompanhamento." : "Tente buscar outro fornecedor ou status."}</p></div>}
    </div>
  );
}

function BillsByDate({ bills, onRemind, onDetail, onDelete, canDelete, selectable, selectedBillIds, onSelectionChange }: { bills: Bill[]; onRemind: (bill: Bill) => void; onDetail: (bill: Bill) => void; onDelete: (bill: Bill) => void; canDelete: boolean; selectable: boolean; selectedBillIds: string[]; onSelectionChange: (ids: string[]) => void }) {
  const groups = groupBillsByDueDate(bills);

  if (!groups.length) {
    return <BillsTable rows={[]} onRemind={onRemind} onDetail={onDetail} canDelete={canDelete} onDelete={onDelete} selectable={selectable} selectedBillIds={selectedBillIds} onSelectionChange={onSelectionChange} />;
  }

  return <div className="bill-date-groups">{groups.map((group) => {
    const days = calculateCalendarDays(group.date);
    const prefix = days < 0 ? "Vencidos" : days === 0 ? "Hoje" : days === 1 ? "Amanhã" : "Vencimento";
    const total = group.bills.reduce((sum, bill) => sum + bill.amountCents, 0);
    return <section className={`bill-date-group ${days < 0 ? "overdue" : ""}`} key={group.date}>
      <header><div><CalendarDays size={17}/><div><small>{prefix}</small><strong>{formatDateLong(group.date)}</strong></div></div><span>{group.bills.length} boleto{group.bills.length === 1 ? "" : "s"} • {formatarCentavosEmReal(total)}</span></header>
      <BillsTable rows={group.bills} onRemind={onRemind} onDetail={onDetail} canDelete={canDelete} onDelete={onDelete} selectable={selectable} selectedBillIds={selectedBillIds} onSelectionChange={onSelectionChange} />
    </section>;
  })}</div>;
}

function BillsPage({ bills, search, onSearch, statusFilter, onFilter, onRemind, onBulkRemind, selectedBillIds, onSelectionChange, onDetail, onNew, canDelete, canBulkRemind, onDelete }: { bills: Bill[]; search: string; onSearch: (value: string) => void; statusFilter: string; onFilter: (value: string) => void; onRemind: (bill: Bill) => void; onBulkRemind: () => void; selectedBillIds: string[]; onSelectionChange: (ids: string[]) => void; onDetail: (bill: Bill) => void; onNew: () => void; canDelete: boolean; canBulkRemind: boolean; onDelete: (bill: Bill) => void }) {
  const pending = bills.filter((bill) => bill.databaseStatus === "pending");
  const dueTomorrow = bills.filter((bill) => calculateCalendarDays(bill.dueDate) === 1 && bill.databaseStatus !== "paid");
  const reminded = bills.filter((bill) => bill.databaseStatus === "reminder_sent");
  const overdue = bills.filter((bill) => bill.tone === "danger");
  return (
    <>
      <section className="page-intro inner"><div><p>Controle financeiro</p><h1>Boletos</h1><h2>Cadastre, acompanhe vencimentos e avise o financeiro.</h2></div><div className="intro-actions"><button className="secondary-button"><Upload size={17}/> Importar planilha</button><button className="primary-button" onClick={onNew}><Plus size={17}/> Novo boleto</button></div></section>
      <section className="summary-strip"><div><span>Pendentes</span><strong>{pending.length}</strong></div><div><span>Vencem amanhã</span><strong>{dueTomorrow.length}</strong></div><div><span>Lembretes preparados</span><strong>{reminded.length}</strong></div><div className="danger-text"><span>Vencidos</span><strong>{overdue.length}</strong></div></section>
      <section className="accounts-card"><div className="filter-row"><label className="search-box"><Search size={17}/><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar fornecedor, CNPJ, categoria..." /></label><label className="filter-select"><SlidersHorizontal size={16}/><select value={statusFilter} onChange={(event) => onFilter(event.target.value)}><option>Todos</option><option>Pendente</option><option>Vence amanhã</option><option>Vencido</option><option>Lembrete enviado</option></select><ChevronDown size={14}/></label><button className="filter-button"><Building2 size={16}/> Todas as empresas <ChevronDown size={14}/></button></div>{canBulkRemind && <div className={`bulk-selection-bar ${selectedBillIds.length ? "active" : ""}`}><div><CheckCircle2 size={18}/><span>{selectedBillIds.length ? `${selectedBillIds.length} boleto${selectedBillIds.length === 1 ? " selecionado" : "s selecionados"}` : "Marque os boletos que deseja incluir no mesmo lembrete"}</span></div><div>{selectedBillIds.length > 0 && <button className="clear-selection" onClick={() => onSelectionChange([])}>Limpar seleção</button>}<button className="bulk-reminder-button" disabled={!selectedBillIds.length} onClick={onBulkRemind}><MessageCircle size={17}/> Lembrar selecionados</button></div></div>}<BillsByDate bills={bills} onRemind={onRemind} onDetail={onDetail} canDelete={canDelete} onDelete={onDelete} selectable={canBulkRemind} selectedBillIds={selectedBillIds} onSelectionChange={onSelectionChange} /><div className="pagination"><span>{bills.length ? `Mostrando ${bills.length} boleto${bills.length === 1 ? "" : "s"}, separados por vencimento` : "Nenhum boleto para mostrar"}</span><div><button disabled><ChevronLeft size={16}/></button><button className="current">1</button><button disabled><ChevronRight size={16}/></button></div></div></section>
    </>
  );
}

function ChecksPage({ checks, onNew, onRemind, onCompensated, canEdit, onEdit, canDelete, onDelete }: { checks: CheckRecord[]; onNew: () => void; onRemind: (check: CheckRecord) => void; onCompensated: (check: CheckRecord) => void; canEdit: boolean; onEdit: (check: CheckRecord) => void; canDelete: boolean; onDelete: (check: CheckRecord) => void }) {
  const [referenceDate, setReferenceDate] = useState(obterDataAtualISO());
  const [targetDate, setTargetDate] = useState(obterDataAtualISO());
  const daysBetween = calculateCalendarDays(targetDate, referenceDate);
  const activeChecks = checks.filter((check) => !["compensated", "cancelled"].includes(check.databaseStatus));
  const nextSevenDays = activeChecks.filter((check) => check.daysUntil >= 0 && check.daysUntil <= 7);
  const todayChecks = activeChecks.filter((check) => check.daysUntil === 0);
  const overdueChecks = activeChecks.filter((check) => check.daysUntil < 0);

  return (
    <>
      <section className="page-intro inner"><div><p>Controle de compromissos</p><h1>Cheques pré-datados</h1><h2>Calcule datas, acompanhe compensações e lembre o financeiro.</h2></div><button className="primary-button" onClick={onNew}><Plus size={17}/> Novo cheque</button></section>
      <section className="summary-strip"><div><span>Aguardando</span><strong>{activeChecks.length}</strong></div><div><span>Próximos 7 dias</span><strong>{nextSevenDays.length}</strong></div><div><span>Compensam hoje</span><strong>{todayChecks.length}</strong></div><div className="danger-text"><span>Data ultrapassada</span><strong>{overdueChecks.length}</strong></div></section>

      <section className="check-tools-grid">
        <article className="date-calculator-card">
          <div className="card-heading"><div><p>Cálculo em dias corridos</p><h3>Calculadora de datas</h3></div><span className="metric-icon blue"><CalendarDays size={20}/></span></div>
          <div className="date-calculator-fields"><label><span>Data inicial</span><input aria-label="Data inicial do cálculo" type="date" value={referenceDate} onChange={(event) => event.target.value && setReferenceDate(event.target.value)}/></label><span><ChevronRight size={18}/></span><label><span>Data final</span><input aria-label="Data final do cálculo" type="date" value={targetDate} onChange={(event) => event.target.value && setTargetDate(event.target.value)}/></label></div>
          <div className={`date-result ${daysBetween < 0 ? "negative" : ""}`}><div><small>DIFERENÇA ENTRE AS DATAS</small><strong>{Math.abs(daysBetween)} {Math.abs(daysBetween) === 1 ? "dia corrido" : "dias corridos"}</strong></div><StatusBadge tone={daysBetween < 0 ? "danger" : daysBetween === 0 ? "warning" : "success"}>{daysBetween < 0 ? "Data já passou" : daysBetween === 0 ? "Mesma data" : formatDateLong(targetDate)}</StatusBadge></div>
        </article>

        <article className="check-reminder-rule"><span className="metric-icon green"><Bell size={20}/></span><div><small>REGRA DE LEMBRETE</small><h3>Antecedência por cheque</h3><p>Ao cadastrar, escolha quantos dias antes a data deve entrar em destaque. O administrador abre o WhatsApp e confirma o envio.</p></div><CheckCircle2 size={20}/></article>
      </section>

      <section className="accounts-card check-accounts-card">
        <div className="card-heading"><div><p>Agenda de compensação</p><h3>Cheques cadastrados</h3></div><span className="check-total">{formatarCentavosEmReal(activeChecks.reduce((total, check) => total + check.amountCents, 0))} em aberto</span></div>
        <div className="table-wrap check-table"><table><thead><tr><th>Beneficiário</th><th>Banco / cheque</th><th>Empresa / filial</th><th>Compensação</th><th>Valor</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{checks.map((check) => <tr key={check.id}><td><div className="supplier-cell"><span>{check.initials}</span><div><strong>{check.beneficiary}</strong><small>Emitido em {formatDateLong(check.issueDate)}</small></div></div></td><td><strong>{check.bankName}</strong><small className="cell-subtitle">Cheque nº {check.checkNumber}</small></td><td>{check.company}</td><td><strong>{check.compensationDateShort}</strong><small className={`cell-subtitle ${check.daysUntil < 0 ? "danger-text" : ""}`}>{describeCheckDate(check.daysUntil)}</small></td><td><strong>{check.value}</strong></td><td><StatusBadge tone={check.tone}>{check.status}</StatusBadge></td><td><div className="check-actions">{canEdit && <button className="edit-row-button" onClick={() => onEdit(check)} aria-label={`Editar cheque ${check.checkNumber}`}><Pencil size={14}/></button>}{check.databaseStatus !== "compensated" && <><button className="whatsapp-mini" onClick={() => onRemind(check)} aria-label={`Lembrar cheque ${check.checkNumber}`}><MessageCircle size={14}/> Lembrar</button><button className="complete-check" onClick={() => onCompensated(check)} aria-label={`Marcar cheque ${check.checkNumber} como compensado`}><Check size={14}/></button></>}{canDelete && <button className="delete-row-button" onClick={() => onDelete(check)} aria-label={`Excluir cheque ${check.checkNumber}`}><Trash2 size={14}/></button>}</div></td></tr>)}</tbody></table></div>
        {checks.length === 0 && <div className="empty-state"><Banknote size={28}/><h3>Nenhum cheque cadastrado</h3><p>Adicione o primeiro cheque para acompanhar a data de compensação.</p></div>}
      </section>
    </>
  );
}

function NewCheckModal({ check, companies, onClose, onSave }: { check?: CheckRecord; companies: CompanyOption[]; onClose: () => void; onSave: (input: NewCheckInput) => Promise<void> | void }) {
  const [beneficiary, setBeneficiary] = useState(check?.beneficiary ?? "");
  const [bankName, setBankName] = useState(check?.bankName ?? "");
  const [branch, setBranch] = useState(check?.branch ?? "");
  const [accountNumber, setAccountNumber] = useState(check?.accountNumber ?? "");
  const [checkNumber, setCheckNumber] = useState(check?.checkNumber ?? "");
  const [amountInput, setAmountInput] = useState(check ? moneyInputFromCents(check.amountCents) : "");
  const [issueDate, setIssueDate] = useState(check?.issueDate ?? obterDataAtualISO());
  const [compensationDate, setCompensationDate] = useState(check?.compensationDate ?? obterDataAtualISO());
  const [reminderDays, setReminderDays] = useState(check?.reminderDays ?? 1);
  const [companyId, setCompanyId] = useState(check?.companyId ?? companies[0]?.id ?? "");
  const [notes, setNotes] = useState(check?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const amountReais = parseBrazilianMoney(amountInput);
  const validDateRange = Boolean(issueDate && compensationDate && calculateCalendarDays(compensationDate, issueDate) >= 0);
  const canSave = beneficiary.trim().length >= 2 && bankName.trim().length >= 2 && checkNumber.trim() && companyId && amountReais > 0 && validDateRange;

  async function handleSave() {
    const company = companies.find((item) => item.id === companyId);
    if (!company || !canSave) return;
    setSaving(true);
    try {
      await onSave({ beneficiary: beneficiary.trim(), bankName: bankName.trim(), branch: branch.trim(), accountNumber: accountNumber.trim(), checkNumber: checkNumber.trim(), companyId: company.id, companyName: company.name, amountCents: Math.round(amountReais * 100), issueDate, compensationDate, reminderDays, notes: notes.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal wide" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-check-title">
        <div className="modal-head"><div><small>{check ? "ALTERAR COMPROMISSO" : "NOVO COMPROMISSO"}</small><h2 id="new-check-title">{check ? "Editar cheque" : "Adicionar cheque"}</h2><p>{check ? "Altere o valor ou qualquer outro dado do cheque." : "Cadastre os dados e defina quando o financeiro deve ser lembrado."}</p></div><button onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
        <div className="check-form modal-form">
          <label><span>Beneficiário</span><input value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} placeholder="Nome do favorecido"/></label>
          <label><span>Empresa / filial</span><select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label><span>Banco</span><input value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Banco emissor"/></label>
          <label><span>Número do cheque</span><input value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} placeholder="Ex.: 004816"/></label>
          <label><span>Agência</span><input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="Opcional"/></label>
          <label><span>Conta</span><input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Opcional"/></label>
          <label><span>Valor do cheque</span><div className="money-input"><b>R$</b><input aria-label="Valor do cheque" type="text" inputMode="decimal" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} placeholder="0,00"/></div><small>Digite diretamente, por exemplo: 1.250,75.</small></label>
          <label><span>Data de emissão</span><input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)}/></label>
          <label><span>Data prevista de compensação</span><input type="date" min={issueDate} value={compensationDate} onChange={(event) => setCompensationDate(event.target.value)}/>{!validDateRange && <small className="field-error">A compensação não pode ser anterior à emissão.</small>}</label>
          <label><span>Lembrar com antecedência</span><div className="suffix-input"><input aria-label="Dias de antecedência do cheque" type="number" min="0" max="90" value={reminderDays} onChange={(event) => setReminderDays(Math.min(90, Math.max(0, Number(event.target.value) || 0)))}/><small>{reminderDays === 1 ? "dia antes" : "dias antes"}</small></div></label>
          <label className="full"><span>Observações</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional"/></label>
        </div>
        <div className="check-value-confirmation"><WalletCards size={19}/><div><small>VALOR QUE SERÁ ARMAZENADO</small><strong>{formatarCentavosEmReal(Math.round(amountReais * 100))}</strong><span>Vinculado ao cheque nº {checkNumber || "não informado"}</span></div></div>
        <div className="check-date-preview"><CalendarDays size={19}/><div><small>DATA CALCULADA</small><strong>{compensationDate ? formatDateLong(compensationDate) : "Informe a data"}</strong><span>{validDateRange ? describeCheckDate(calculateCalendarDays(compensationDate)) : "Corrija o intervalo de datas"}</span></div></div>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || !canSave} onClick={() => void handleSave()}><Check size={17}/> {saving ? "Salvando..." : check ? "Salvar alterações" : "Salvar cheque"}</button></div>
      </section>
    </div>
  );
}

function CheckReminderModal({ check, workspace, onClose, onSend }: { check: CheckRecord; workspace: WorkspaceContext; onClose: () => void; onSend: (message: string) => void }) {
  const [message, setMessage] = useState(`Olá, ${workspace.financeContactName}! Lembrete: o cheque nº ${check.checkNumber}, emitido para ${check.beneficiary}, no valor de ${check.value}, tem compensação prevista para ${check.compensationDateLong} (${describeCheckDate(check.daysUntil)}). Por favor, confirme saldo e programação.`);
  const contactInitials = workspace.financeContactName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "RF";
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal reminder-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="check-reminder-title">
        <div className="modal-head"><div><small>LEMBRETE DE CHEQUE</small><h2 id="check-reminder-title">Avisar pelo WhatsApp</h2><p>Revise a mensagem antes de abrir o aplicativo.</p></div><button onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
        <div className="recipient-card"><MiniAvatar initials={contactInitials} color="mint"/><div><small>RESPONSÁVEL FINANCEIRO</small><strong>{workspace.financeContactName}</strong><span>{formatWhatsAppPhone(workspace.financeContactPhone)}</span></div><CheckCircle2 size={18}/></div>
        <div className="bill-preview"><div><MiniAvatar initials={check.initials} color={check.daysUntil < 0 ? "red" : "amber"}/><div><strong>{check.beneficiary}</strong><small>{check.bankName} • Cheque nº {check.checkNumber}</small></div><StatusBadge tone={check.tone}>{check.status}</StatusBadge></div><dl><div><dt>Valor</dt><dd>{check.value}</dd></div><div><dt>Compensação</dt><dd>{check.compensationDateLong}</dd></div></dl></div>
        <label className="message-label"><span>Mensagem</span><textarea value={message} onChange={(event) => setMessage(event.target.value)}/><small>O sistema abre o WhatsApp; o envio só acontece após sua confirmação.</small></label>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="whatsapp-button" disabled={!message.trim()} onClick={() => onSend(message.trim())}><MessageCircle size={18}/> Abrir WhatsApp</button></div>
      </section>
    </div>
  );
}

function RemindersPage({ bills, checks, workspace, onRemind, onEditContact }: { bills: Bill[]; checks: CheckRecord[]; workspace: WorkspaceContext; onRemind: () => void; onEditContact: () => void }) {
  const billReminders = bills.filter((bill) => bill.databaseStatus === "reminder_sent").map((bill) => ({
    id: `bill-${bill.id}`,
    title: bill.supplier,
    subtitle: `${bill.value} • Boleto`,
    initials: bill.initials,
  }));
  const checkReminders = checks.filter((check) => check.databaseStatus === "reminder_sent").map((check) => ({
    id: `check-${check.id}`,
    title: check.beneficiary,
    subtitle: `${check.value} • Cheque nº ${check.checkNumber}`,
    initials: check.initials,
  }));
  const reminderItems = [...billReminders, ...checkReminders];
  const hasContact = Boolean(workspace.financeContactName && isValidWhatsAppPhone(workspace.financeContactPhone));
  return (
    <>
      <section className="page-intro inner"><div><p>Comunicação</p><h1>Lembretes via WhatsApp</h1><h2>Acompanhe os avisos enviados ao responsável financeiro.</h2></div><button className="primary-button" onClick={onRemind}><MessageCircle size={17}/> Novo lembrete</button></section>
      <section className="reminder-overview"><article><div><span className="metric-icon green"><Send size={20}/></span><div><small>Lembretes preparados</small><strong>{reminderItems.length}</strong></div></div><StatusBadge tone="neutral">Total atual</StatusBadge></article><article><div><span className="metric-icon blue"><WalletCards size={20}/></span><div><small>Boletos lembrados</small><strong>{billReminders.length}</strong></div></div></article><article><div><span className="metric-icon yellow"><Banknote size={20}/></span><div><small>Cheques lembrados</small><strong>{checkReminders.length}</strong></div></div></article></section>
      <section className="reminders-layout"><article className="history-card"><div className="card-heading"><div><p>Acompanhamento</p><h3>Itens com lembrete preparado</h3></div></div><div className="history-list">{reminderItems.map((item) => <div key={item.id}><MiniAvatar initials={item.initials} color="blue"/><div><strong>{item.title}</strong><small>{item.subtitle} • Para {workspace.financeContactName || "contato não configurado"}</small></div><div><StatusBadge tone="neutral">WhatsApp aberto</StatusBadge></div></div>)}</div>{reminderItems.length === 0 && <div className="empty-state"><MessageCircle size={28}/><h3>Nenhum lembrete preparado</h3><p>Os lembretes aparecerão aqui depois que você abrir o WhatsApp.</p></div>}</article><aside className="finance-contact"><span className="contact-icon"><UserRound size={22}/></span><small>RESPONSÁVEL FINANCEIRO</small><h3>{workspace.financeContactName || "Não configurado"}</h3><p>Financeiro • {workspace.groupName}</p><div className="phone"><MessageCircle size={16}/><span>{hasContact ? formatWhatsAppPhone(workspace.financeContactPhone) : "Informe um WhatsApp com DDD"}</span></div><button onClick={onEditContact}>Editar contato</button><div className="privacy-note"><CheckCircle2 size={15}/><span>O WhatsApp só abre após uma ação do administrador. A mensagem não é enviada automaticamente.</span></div></aside></section>
    </>
  );
}

function ReportsPage({ bills, workspace }: { bills: Bill[]; workspace: WorkspaceContext }) {
  const total = bills.reduce((sum, bill) => sum + bill.amountCents, 0);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const aggregate = (key: "category" | "supplier") => {
    const values = new Map<string, number>();
    bills.forEach((bill) => values.set(bill[key], (values.get(bill[key]) ?? 0) + bill.amountCents));
    return [...values.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  };
  const categories = aggregate("category");
  const suppliers = aggregate("supplier").slice(0, 5);
  const maxCategory = Math.max(...categories.map((item) => item.amount), 1);
  const periodLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());

  async function handleExport() {
    setExporting(true);
    setExportMessage("");
    try {
      await exportBillsToExcel(bills, workspace.groupName);
      setExportMessage("Planilha do Excel gerada com todos os boletos, organizada por vencimento.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Não foi possível gerar a planilha.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <section className="page-intro inner"><div><p>Análises</p><h1>Relatórios financeiros</h1><h2>Entenda os pagamentos por período, categoria e fornecedor.</h2></div><button className="secondary-button" disabled={!bills.length || exporting} onClick={() => void handleExport()}><FileSpreadsheet size={17}/> {exporting ? "Gerando..." : "Exportar Excel"}</button></section>
      {exportMessage && <div className="export-message"><CheckCircle2 size={16}/><span>{exportMessage}</span></div>}
      <section className="report-filters"><button><CalendarDays size={16}/> {periodLabel} <ChevronDown size={14}/></button><button><Building2 size={16}/> Todas as empresas <ChevronDown size={14}/></button><button><SlidersHorizontal size={16}/> Todas as categorias <ChevronDown size={14}/></button></section>
      <section className="report-grid"><article className="bar-card"><div className="card-heading"><div><p>Visão consolidada</p><h3>Despesas por categoria</h3></div><StatusBadge tone="success">Total {formatarCentavosEmReal(total)}</StatusBadge></div>{categories.length ? <div className="horizontal-bars">{categories.map((item, index) => <div key={item.name}><div><span>{item.name}</span><strong>{formatarCentavosEmReal(item.amount)}</strong></div><i><b className={["teal", "purple", "yellow", "blue", "gray"][index % 5]} style={{width:`${Math.round((item.amount / maxCategory) * 100)}%`}}/></i></div>)}</div> : <div className="empty-state"><CircleDollarSign size={28}/><h3>Sem despesas cadastradas</h3><p>Cadastre boletos para gerar o relatório por categoria.</p></div>}</article><article className="supplier-ranking"><div className="card-heading"><div><p>Concentração</p><h3>Maiores fornecedores</h3></div></div>{suppliers.map((item,index) => <div className="rank-row" key={item.name}><em>{index+1}</em><MiniAvatar initials={item.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FO"} color="blue"/><div><strong>{item.name}</strong><small>{formatarCentavosEmReal(item.amount)}</small></div><span>{total ? `${((item.amount / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0%"}</span></div>)}{suppliers.length === 0 && <div className="empty-state"><Building2 size={28}/><h3>Sem fornecedores</h3><p>Os maiores fornecedores aparecerão aqui.</p></div>}</article></section>
    </>
  );
}

function SettingsPage({ workspace, onSaveContact, onSaveGroup, onSaveProfile }: {
  workspace: WorkspaceContext;
  onSaveContact: (input: FinanceContactInput) => Promise<void>;
  onSaveGroup: (name: string) => Promise<void>;
  onSaveProfile: (input: ProfileSettingsInput) => Promise<void>;
}) {
  const [contactName, setContactName] = useState(workspace.financeContactName);
  const [phone, setPhone] = useState(workspace.financeContactPhone ? formatWhatsAppPhone(workspace.financeContactPhone) : "");
  const [messageTemplate, setMessageTemplate] = useState(workspace.reminderMessageTemplate || DEFAULT_REMINDER_TEMPLATE);
  const [groupName, setGroupName] = useState(workspace.groupName);
  const [profileName, setProfileName] = useState(workspace.userName);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(workspace.avatarUrl);
  const [avatarError, setAvatarError] = useState("");
  const [saving, setSaving] = useState<"contact" | "group" | "profile" | "">("");
  const phoneIsValid = !phone || isValidWhatsAppPhone(phone);
  const canEdit = workspace.role === "admin";

  function chooseAvatar(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setAvatarError("Use uma foto JPG, PNG ou WebP de até 3 MB.");
      return;
    }
    setAvatarError("");
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleContactSave() {
    if (!canEdit || !contactName.trim() || !isValidWhatsAppPhone(phone)) return;
    setSaving("contact");
    try {
      await onSaveContact({ name: contactName, phone, messageTemplate });
      setPhone(formatWhatsAppPhone(phone));
    } finally {
      setSaving("");
    }
  }

  async function handleGroupSave() {
    if (!canEdit || groupName.trim().length < 2) return;
    setSaving("group");
    try {
      await onSaveGroup(groupName);
    } finally {
      setSaving("");
    }
  }

  async function handleProfileSave() {
    if (profileName.trim().length < 2) return;
    setSaving("profile");
    try {
      await onSaveProfile({ name: profileName, avatarFile });
      setAvatarFile(null);
    } finally {
      setSaving("");
    }
  }

  return (
    <>
      <section className="page-intro inner"><div><p>Preferências</p><h1>Configurações</h1><h2>Atualize seu perfil, o grupo empresarial e o contato dos lembretes.</h2></div></section>
      <section className="settings-layout">
        <aside className="settings-nav"><button className="active"><UserRound size={17}/> Meu perfil</button><button><Building2 size={17}/> Grupo empresarial</button><button><MessageCircle size={17}/> WhatsApp</button><button><Bell size={17}/> Alertas</button></aside>
        <div className="settings-stack">
          <article className="settings-card">
            <div className="settings-title"><span><UserRound size={21}/></span><div><h3>Meu perfil</h3><p>Altere seu nome e a foto exibida no sistema.</p></div></div>
            <div className="profile-settings-row"><div className="avatar-editor"><ProfileAvatar name={profileName || workspace.userName} url={avatarPreview} size="large"/><label className="avatar-upload-button"><Camera size={16}/> Alterar foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseAvatar(event.target.files?.[0])}/></label><small>JPG, PNG ou WebP • até 3 MB</small></div><label className="profile-name-field"><span>Nome do perfil</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Seu nome" />{avatarError && <small className="field-error">{avatarError}</small>}</label></div>
            <div className="settings-footer"><button className="primary-button" disabled={saving !== "" || profileName.trim().length < 2 || Boolean(avatarError)} onClick={() => void handleProfileSave()}>{saving === "profile" ? "Salvando..." : "Salvar perfil"}</button></div>
          </article>

          <article className="settings-card">
            <div className="settings-title"><span><Building2 size={21}/></span><div><h3>Grupo empresarial</h3><p>Nome usado em todas as empresas e relatórios do grupo.</p></div></div>
            <div className="form-grid"><label className="full"><span>Nome do grupo</span><input disabled={!canEdit} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Nome do grupo empresarial" /></label></div>
            {!canEdit && <div className="gate-message"><AlertCircle size={15}/><span>Somente o administrador pode alterar o nome do grupo.</span></div>}
            <div className="settings-footer"><button className="primary-button" disabled={!canEdit || saving !== "" || groupName.trim().length < 2} onClick={() => void handleGroupSave()}>{saving === "group" ? "Salvando..." : "Salvar nome do grupo"}</button></div>
          </article>

          <article className="settings-card">
            <div className="settings-title"><span><MessageCircle size={21}/></span><div><h3>Responsável financeiro</h3><p>Este contato será usado em todos os lembretes do grupo.</p></div></div>
            <div className="form-grid"><label><span>Nome do responsável</span><input disabled={!canEdit} value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Nome do responsável" /></label><label><span>WhatsApp com DDD</span><input disabled={!canEdit} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(DDD) 99999-9999" inputMode="tel" />{!phoneIsValid && <small className="field-error">Informe DDD e número. O código +55 é incluído automaticamente.</small>}</label><label className="full"><span>Mensagem padrão para boletos</span><textarea disabled={!canEdit} value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} /><small>Campos disponíveis: {"{nome}"}, {"{fornecedor}"}, {"{valor}"} e {"{vencimento}"}.</small></label></div>
            {!canEdit && <div className="gate-message"><AlertCircle size={15}/><span>Somente o administrador pode alterar este contato.</span></div>}
            <div className="setting-rule"><div><span className="metric-icon yellow"><Clock3 size={19}/></span><div><strong>Alerta antes do vencimento</strong><small>Destacar boletos para o administrador</small></div></div><select defaultValue="1 dia antes" disabled><option>1 dia antes</option></select></div>
            <div className="settings-footer"><button className="primary-button" disabled={!canEdit || saving !== "" || !contactName.trim() || !isValidWhatsAppPhone(phone)} onClick={() => void handleContactSave()}>{saving === "contact" ? "Salvando..." : "Salvar WhatsApp"}</button></div>
          </article>
        </div>
      </section>
    </>
  );
}

function InterestCalculatorPage() {
  const [amountReais, setAmountReais] = useState(10_000);
  const [dueDate, setDueDate] = useState("2026-08-01");
  const [calculationDate, setCalculationDate] = useState(obterDataAtualISO());
  const [lateFeePercent, setLateFeePercent] = useState(2);
  const [monthlyInterestPercent, setMonthlyInterestPercent] = useState(1);

  const calculation = useMemo(() => calcularJurosBanco({
    valorOriginalCentavos: Math.max(1, Math.round(amountReais * 100)),
    dataVencimento: dueDate,
    dataCalculo: calculationDate,
    multaPercentual: lateFeePercent,
    jurosMensalPercentual: monthlyInterestPercent,
  }), [amountReais, dueDate, calculationDate, lateFeePercent, monthlyInterestPercent]);

  return (
    <>
      <section className="page-intro inner">
        <div>
          <p>Simulação de encargos</p>
          <h1>Calculadora de juros bancários</h1>
          <h2>Estime multa e juros simples de um boleto vencido.</h2>
        </div>
      </section>

      <section className="interest-layout">
        <article className="interest-form-card">
          <div className="card-heading">
            <div><p>Dados do boleto</p><h3>Informe as condições do banco</h3></div>
            <span className="metric-icon blue"><Calculator size={20}/></span>
          </div>
          <div className="calculator-form">
            <label className="full">
              <span>Valor original do boleto</span>
              <div className="money-input"><b>R$</b><input aria-label="Valor original do boleto" type="number" min="0.01" step="0.01" value={amountReais} onChange={(event) => setAmountReais(Math.max(0.01, Number(event.target.value)))} /></div>
            </label>
            <label><span>Data de vencimento</span><input aria-label="Data de vencimento" type="date" value={dueDate} onChange={(event) => event.target.value && setDueDate(event.target.value)} /></label>
            <label><span>Calcular até</span><input aria-label="Calcular até" type="date" value={calculationDate} onChange={(event) => event.target.value && setCalculationDate(event.target.value)} /></label>
            <label><span>Multa por atraso</span><div className="rate-input"><input aria-label="Multa por atraso" type="number" min="0" max="100" step="0.01" value={lateFeePercent} onChange={(event) => setLateFeePercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><Percent size={14}/></div></label>
            <label><span>Juros simples ao mês</span><div className="rate-input"><input aria-label="Juros simples ao mês" type="number" min="0" max="100" step="0.01" value={monthlyInterestPercent} onChange={(event) => setMonthlyInterestPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><Percent size={14}/></div></label>
          </div>
          <div className="formula-note"><Landmark size={17}/><p>Use as taxas descritas no boleto ou informadas pelo banco. O sistema considera mês de 30 dias e juros simples proporcionais.</p></div>
        </article>

        <article className="interest-result-card">
          <div className="result-heading"><span>VALOR ESTIMADO PARA PAGAMENTO</span><StatusBadge tone={calculation.diasEmAtraso > 0 ? "danger" : "success"}>{calculation.diasEmAtraso > 0 ? `${calculation.diasEmAtraso} ${calculation.diasEmAtraso === 1 ? "dia" : "dias"} em atraso` : "Sem atraso"}</StatusBadge></div>
          <strong className="updated-total">{formatarCentavosEmReal(calculation.valorAtualizadoCentavos)}</strong>
          <div className="interest-breakdown">
            <div><span>Valor original</span><strong>{formatarCentavosEmReal(Math.round(amountReais * 100))}</strong></div>
            <div><span>Multa ({lateFeePercent.toLocaleString("pt-BR")}% uma vez)</span><strong>{formatarCentavosEmReal(calculation.multaCentavos)}</strong></div>
            <div><span>Juros ({monthlyInterestPercent.toLocaleString("pt-BR")}% ao mês)</span><strong>{formatarCentavosEmReal(calculation.jurosCentavos)}</strong></div>
            <div className="total-line"><span>Total de encargos</span><strong>+ {formatarCentavosEmReal(calculation.encargosCentavos)}</strong></div>
          </div>
          <div className="daily-rate"><span>Taxa diária estimada</span><strong>{calculation.taxaDiariaPercentual.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}% ao dia</strong></div>
          <div className="estimate-warning"><AlertCircle size={17}/><p>Este cálculo é apenas uma estimativa. Antes de pagar, confirme o valor atualizado no boleto ou no canal oficial do banco/emissor.</p></div>
        </article>
      </section>
    </>
  );
}

function NewBillModal({ companies, onClose, onSave }: { companies: CompanyOption[]; onClose: () => void; onSave: (input: NewBillInput) => Promise<void> | void }) {
  const [method, setMethod] = useState("upload");
  const [supplier, setSupplier] = useState("");
  const [supplierTaxId, setSupplierTaxId] = useState("");
  const [category, setCategory] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [dueDate, setDueDate] = useState(obterDataAtualISO());
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [barcode, setBarcode] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [notes, setNotes] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [readingPdf, setReadingPdf] = useState(false);
  const [pdfMessage, setPdfMessage] = useState("");
  const [hasProtest, setHasProtest] = useState(false);
  const [protestDays, setProtestDays] = useState(3);
  const [hasInterest, setHasInterest] = useState(false);
  const [lateFeePercent, setLateFeePercent] = useState(2);
  const [monthlyInterestPercent, setMonthlyInterestPercent] = useState(1);
  const [saving, setSaving] = useState(false);
  const amountReais = parseBrazilianMoney(amountInput);
  const normalizedSupplierTaxId = normalizeCnpj(supplierTaxId);
  const validSupplierTaxId = !normalizedSupplierTaxId || normalizedSupplierTaxId.length === 14;

  async function processPdf(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      setPdfMessage("Selecione um PDF de até 10 MB.");
      return;
    }

    let fileBytes: ArrayBuffer;
    try {
      fileBytes = await file.arrayBuffer();
    } catch {
      setPdfMessage("Não foi possível acessar o PDF selecionado. Escolha o arquivo novamente.");
      return;
    }

    setPdfFile(file);
    setReadingPdf(true);
    setPdfMessage("Lendo os dados do boleto...");
    try {
      const text = await readPdfText(fileBytes);
      const parsed = parseBillPdfText(text);
      if (parsed.supplier) setSupplier(parsed.supplier);
      if (parsed.supplierTaxId) setSupplierTaxId(formatCnpj(parsed.supplierTaxId));
      if (parsed.amountCents) setAmountInput(moneyInputFromCents(parsed.amountCents));
      if (parsed.dueDate) setDueDate(parsed.dueDate);
      if (parsed.barcode) setBarcode(parsed.barcode);
      const found = [parsed.supplier, parsed.supplierTaxId, parsed.amountCents, parsed.dueDate, parsed.barcode].filter(Boolean).length;
      setPdfMessage(found ? `${file.name}: ${found} campos preenchidos automaticamente. Revise antes de salvar.` : `${file.name}: não encontramos campos reconhecíveis. Preencha os dados manualmente.`);
    } catch (error) {
      setPdfMessage(error instanceof Error ? error.message : "Não foi possível ler o PDF.");
    } finally {
      setReadingPdf(false);
    }
  }

  async function handleSave() {
    const company = companies.find((item) => item.id === companyId);
    if (!supplier.trim() || !company || !dueDate || amountReais <= 0) return;

    setSaving(true);
    try {
      await onSave({
        supplier: supplier.trim(),
        supplierTaxId: normalizedSupplierTaxId,
        category: category.trim() || "Outros",
        companyId: company.id,
        companyName: company.name,
        amountCents: Math.round(amountReais * 100),
        dueDate,
        barcode: barcode.trim(),
        protestDays: hasProtest ? protestDays : null,
        lateFeePercent: hasInterest ? lateFeePercent : 0,
        monthlyInterestPercent: hasInterest ? monthlyInterestPercent : 0,
        costCenter: costCenter.trim(),
        notes: notes.trim(),
        pdfFile,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal wide" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-bill-title">
        <div className="modal-head"><div><small>NOVO LANÇAMENTO</small><h2 id="new-bill-title">Adicionar boleto</h2><p>Envie o arquivo ou preencha os dados manualmente.</p></div><button onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
        <div className="method-tabs"><button className={method === "upload" ? "active" : ""} onClick={() => setMethod("upload")}><Upload size={16}/> Enviar arquivo</button><button className={method === "manual" ? "active" : ""} onClick={() => setMethod("manual")}><FileText size={16}/> Cadastro manual</button></div>
        {method === "upload" && <div className={`dropzone ${pdfFile ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void processPdf(event.dataTransfer.files[0]); }}><span>{readingPdf ? <span className="loading-spinner"/> : pdfFile ? <CheckCircle2 size={25}/> : <Upload size={25}/>}</span><h3>{pdfFile ? pdfFile.name : "Arraste o boleto em PDF para cá"}</h3><p>PDF com até 10 MB • os campos serão lidos automaticamente</p><label className="dropzone-button">{readingPdf ? "Lendo..." : pdfFile ? "Trocar PDF" : "Selecionar PDF"}<input type="file" accept="application/pdf" disabled={readingPdf} onChange={(event) => void processPdf(event.target.files?.[0])}/></label><small className={pdfMessage.includes("não") || pdfMessage.includes("Não") ? "field-error" : "pdf-success"}>{pdfMessage || "Depois da leitura, revise fornecedor, CNPJ, valor, vencimento e código de barras."}</small></div>}
        <div className="modal-form">
          <label><span>Fornecedor</span><input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Nome do fornecedor" /></label>
          <label><span>CNPJ do beneficiário</span><input value={supplierTaxId} onChange={(event) => setSupplierTaxId(formatCnpj(event.target.value))} placeholder="00.000.000/0000-00" inputMode="numeric" maxLength={18} />{!validSupplierTaxId && <small className="field-error">Digite os 14 números do CNPJ ou deixe o campo vazio.</small>}</label>
          <label><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Serviços públicos" /></label>
          <label><span>Valor</span><input aria-label="Valor do boleto" type="text" inputMode="decimal" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} placeholder="0,00" /><small>Digite diretamente, por exemplo: 1.250,75.</small></label>
          <label><span>Vencimento</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label><span>Empresa / filial</span><select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label><span>Código de barras</span><input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Opcional" /></label>
          <label><span>Centro de custo</span><input value={costCenter} onChange={(event) => setCostCenter(event.target.value)} placeholder="Opcional" /></label>
          <label className="full"><span>Observações</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informações adicionais do boleto" /></label>
        </div>

        <div className={`bank-rule ${hasInterest ? "active" : ""}`}>
          <span className="bank-rule-icon"><Landmark size={20}/></span>
          <div><strong>Multa e juros do banco</strong><small>Cadastre as taxas descritas no boleto para estimar o valor após o vencimento.</small></div>
          <button type="button" className={`toggle ${hasInterest ? "active" : ""}`} aria-label="Ativar cálculo de juros bancários" aria-pressed={hasInterest} onClick={() => setHasInterest(!hasInterest)}><i/></button>
          {hasInterest && <div className="bank-rate-fields"><label><span>Multa por atraso</span><div><input aria-label="Multa por atraso do boleto" type="number" min="0" max="100" step="0.01" value={lateFeePercent} onChange={(event) => setLateFeePercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><small>% uma vez</small></div></label><label><span>Juros simples</span><div><input aria-label="Juros mensais do boleto" type="number" min="0" max="100" step="0.01" value={monthlyInterestPercent} onChange={(event) => setMonthlyInterestPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><small>% ao mês</small></div></label><p><AlertCircle size={14}/> Estimativa. O valor oficial deve ser confirmado com o banco.</p></div>}
        </div>

        <div className={`protest-rule ${hasProtest ? "active" : ""}`}><span className="protest-icon"><Gavel size={20}/></span><div><strong>Prazo para entrar em protesto</strong><small>Informe quantos dias após o vencimento este boleto poderá ser protestado.</small></div><button type="button" className={`toggle ${hasProtest ? "active" : ""}`} aria-label="Ativar prazo para protesto" aria-pressed={hasProtest} onClick={() => setHasProtest(!hasProtest)}><i/></button>{hasProtest && <label><span>Dias após o vencimento</span><div><input aria-label="Dias após o vencimento" type="number" min="1" max="90" value={protestDays} onChange={(event) => setProtestDays(Math.max(1, Number(event.target.value)))} /><small>{protestDays === 1 ? "dia" : "dias"}</small></div></label>}</div>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || readingPdf || !supplier.trim() || !companyId || !dueDate || amountReais <= 0 || !validSupplierTaxId} onClick={() => void handleSave()}><Check size={17}/> {saving ? "Salvando dados e PDF..." : "Salvar boleto"}</button></div>
      </section>
    </div>
  );
}

function ReminderModal({ bill, workspace, onClose, onSend }: { bill: Bill; workspace: WorkspaceContext; onClose: () => void; onSend: (message: string) => void }) {
  const calculation = calcularEncargosDoBoleto(bill);
  const protestNotice = bill.protestDays ? ` Atenção: este boleto poderá entrar em protesto ${bill.protestDays} ${bill.protestDays === 1 ? "dia" : "dias"} após o vencimento.` : "";
  const interestNotice = calculation.diasEmAtraso > 0
    ? ` Estimativa atualizada: ${formatarCentavosEmReal(calculation.valorAtualizadoCentavos)} (${calculation.diasEmAtraso} ${calculation.diasEmAtraso === 1 ? "dia" : "dias"} em atraso). Confirme o valor oficial com o banco.`
    : "";
  const baseMessage = renderReminderTemplate(workspace.reminderMessageTemplate, {
    nome: workspace.financeContactName,
    fornecedor: bill.supplier,
    valor: bill.value,
    vencimento: bill.dueLong,
  });
  const [message, setMessage] = useState(`${baseMessage}${interestNotice}${protestNotice}`);
  const contactInitials = workspace.financeContactName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "RF";
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal reminder-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reminder-title">
        <div className="modal-head"><div><small>LEMBRETE DE PAGAMENTO</small><h2 id="reminder-title">Enviar pelo WhatsApp</h2><p>Revise a mensagem antes de abrir o WhatsApp.</p></div><button onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
        <div className="recipient-card"><MiniAvatar initials={contactInitials} color="mint"/><div><small>RESPONSÁVEL FINANCEIRO</small><strong>{workspace.financeContactName}</strong><span>{formatWhatsAppPhone(workspace.financeContactPhone)}</span></div><CheckCircle2 size={18}/></div>
        <div className="bill-preview">
          <div><MiniAvatar initials={bill.initials} color={bill.tone === "danger" ? "red" : "amber"}/><div><strong>{bill.supplier}</strong><small>{bill.company}</small></div><StatusBadge tone={bill.tone}>{bill.status}</StatusBadge></div>
          <dl>
            <div><dt>Valor original</dt><dd>{bill.value}</dd></div>
            <div><dt>Vencimento</dt><dd>{bill.dueLong}</dd></div>
            {calculation.diasEmAtraso > 0 && <div className="bank-preview"><dt>Valor atualizado estimado</dt><dd>{formatarCentavosEmReal(calculation.valorAtualizadoCentavos)} <small>{calculation.diasEmAtraso} {calculation.diasEmAtraso === 1 ? "dia" : "dias"} em atraso</small></dd></div>}
            {bill.protestDays && <div className="protest-preview"><dt>Prazo para protesto</dt><dd>{bill.protestDays} {bill.protestDays === 1 ? "dia após o vencimento" : "dias após o vencimento"}</dd></div>}
          </dl>
        </div>
        <label className="message-label"><span>Mensagem</span><textarea value={message} onChange={(event) => setMessage(event.target.value)}/><small>Você poderá editar novamente antes de enviar no WhatsApp.</small></label>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="whatsapp-button" disabled={!message.trim()} onClick={() => onSend(message.trim())}><MessageCircle size={18}/> Abrir WhatsApp</button></div>
      </section>
    </div>
  );
}

function BulkReminderModal({ bills, workspace, onClose, onSend }: { bills: Bill[]; workspace: WorkspaceContext; onClose: () => void; onSend: (message: string) => void }) {
  const total = formatarCentavosEmReal(bills.reduce((sum, bill) => sum + bill.amountCents, 0));
  const [message, setMessage] = useState(() => renderBulkReminderMessage(
    workspace.financeContactName,
    bills.map((bill) => ({ fornecedor: bill.supplier, valor: bill.value, vencimento: bill.dueLong })),
    total,
  ));
  const contactInitials = workspace.financeContactName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "RF";

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal reminder-modal bulk-reminder-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bulk-reminder-title">
        <div className="modal-head"><div><small>LEMBRETE EM GRUPO</small><h2 id="bulk-reminder-title">Enviar {bills.length} boletos pelo WhatsApp</h2><p>Todos os boletos serão enviados em uma única mensagem.</p></div><button onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
        <div className="recipient-card"><MiniAvatar initials={contactInitials} color="mint"/><div><small>RESPONSÁVEL FINANCEIRO</small><strong>{workspace.financeContactName}</strong><span>{formatWhatsAppPhone(workspace.financeContactPhone)}</span></div><CheckCircle2 size={18}/></div>
        <section className="bulk-bill-preview">
          <header><div><small>BOLETOS SELECIONADOS</small><strong>{bills.length} {bills.length === 1 ? "boleto" : "boletos"}</strong></div><span>{total}</span></header>
          <div className="bulk-bill-list">{bills.map((bill) => <article key={bill.id}><MiniAvatar initials={bill.initials} color={bill.tone === "danger" ? "red" : "amber"}/><div><strong>{bill.supplier}</strong><small>{bill.company} • {bill.dueLong}</small></div><span>{bill.value}</span></article>)}</div>
          {bills.some((bill) => bill.tone === "danger") && <p><AlertCircle size={14}/> O total usa os valores originais. Confirme no banco os juros dos boletos vencidos.</p>}
        </section>
        <label className="message-label"><span>Mensagem</span><textarea value={message} onChange={(event) => setMessage(event.target.value)}/><small>Revise a lista antes de abrir o WhatsApp.</small></label>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="whatsapp-button" disabled={!message.trim()} onClick={() => onSend(message.trim())}><MessageCircle size={18}/> Abrir WhatsApp com {bills.length} boletos</button></div>
      </section>
    </div>
  );
}

function BillDetail({ bill, workspace, onClose, onRemind, onPaid, onDelete, onOpenPdf, onUploadReceipt, onOpenReceipt }: { bill: Bill; workspace: WorkspaceContext; onClose: () => void; onRemind: () => void; onPaid: () => void; onDelete: () => void; onOpenPdf: () => void; onUploadReceipt: (file: File) => Promise<void>; onOpenReceipt: () => void }) {
  const calculation = calcularEncargosDoBoleto(bill);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const paymentAllowed = canMarkBillPaid(bill);
  const canUploadReceipt = workspace.role !== "aprovador";

  async function selectReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingReceipt(true);
    try {
      await onUploadReceipt(file);
    } finally {
      setUploadingReceipt(false);
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="detail-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head"><div><small>DETALHES DO BOLETO</small><h2>{bill.supplier}</h2></div><button onClick={onClose} aria-label="Fechar detalhes"><X size={20}/></button></div>
        <div className="detail-status"><MiniAvatar initials={bill.initials} color={bill.tone === "danger" ? "red" : "amber"}/><div><strong>{bill.value}</strong><span>Vencimento: {bill.dueLong}</span></div><StatusBadge tone={bill.tone}>{bill.status}</StatusBadge></div>

        {calculation.diasEmAtraso > 0 && <div className="bank-calculation-card">
          <div className="bank-calculation-heading"><span><Landmark size={18}/></span><div><small>VALOR ATUALIZADO ESTIMADO</small><strong>{formatarCentavosEmReal(calculation.valorAtualizadoCentavos)}</strong></div><em>{calculation.diasEmAtraso} {calculation.diasEmAtraso === 1 ? "dia" : "dias"}</em></div>
          <dl><div><dt>Original</dt><dd>{formatarCentavosEmReal(bill.amountCents)}</dd></div><div><dt>Multa ({bill.lateFeePercent.toLocaleString("pt-BR")}%)</dt><dd>+ {formatarCentavosEmReal(calculation.multaCentavos)}</dd></div><div><dt>Juros ({bill.monthlyInterestPercent.toLocaleString("pt-BR")}% a.m.)</dt><dd>+ {formatarCentavosEmReal(calculation.jurosCentavos)}</dd></div></dl>
          <p><AlertCircle size={14}/> Confirme o valor oficial no banco antes do pagamento.</p>
        </div>}

        {bill.protestDays && <div className="protest-alert"><span><Gavel size={19}/></span><div><small>PRAZO PARA PROTESTO</small><strong>{bill.protestDays} {bill.protestDays === 1 ? "dia" : "dias"} após o vencimento</strong><p>O financeiro será avisado sobre este prazo no lembrete.</p></div></div>}
        <section className={`receipt-box ${bill.paymentReceiptPath ? "has-receipt" : "needs-receipt"}`}>
          <span className="receipt-icon">{bill.paymentReceiptPath ? <CheckCircle2 size={21}/> : <Upload size={21}/>}</span>
          <div className="receipt-copy"><small>COMPROVANTE DE PAGAMENTO</small><strong>{bill.paymentReceiptPath ? bill.paymentReceiptName || "Comprovante anexado" : "Comprovante obrigatório"}</strong><span>{bill.paymentReceiptPath ? `Armazenado com acesso protegido${bill.paymentReceiptUploadedAt ? ` em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(bill.paymentReceiptUploadedAt))}` : ""}.` : "Envie um PDF, JPG ou PNG de até 10 MB para liberar o pagamento."}</span></div>
          <div className="receipt-buttons">
            {bill.paymentReceiptPath && <button type="button" onClick={onOpenReceipt} aria-label="Abrir comprovante"><Download size={17}/></button>}
            {canUploadReceipt && <label className={uploadingReceipt ? "uploading" : ""}>{uploadingReceipt ? "Enviando..." : bill.paymentReceiptPath ? "Substituir" : "Anexar"}<input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" disabled={uploadingReceipt} onChange={(event) => void selectReceipt(event)}/></label>}
          </div>
        </section>
        {!paymentAllowed && bill.databaseStatus !== "paid" && <p className="receipt-required"><AlertCircle size={15}/> O pagamento só poderá ser confirmado depois que o comprovante for anexado.</p>}
        <div className="detail-actions"><button onClick={onRemind}><MessageCircle size={17}/> Lembrar no WhatsApp</button>{bill.databaseStatus !== "paid" && <button onClick={onPaid} disabled={!paymentAllowed} title={!paymentAllowed ? "Anexe o comprovante para liberar esta ação" : undefined}><CheckCircle2 size={17}/> Marcar como pago</button>}{workspace.role === "admin" && <button className="danger-button" onClick={onDelete}><Trash2 size={17}/> Excluir boleto</button>}</div>
        <section className="detail-section"><h3>Informações</h3><dl><div><dt>Empresa / filial</dt><dd>{bill.company}</dd></div><div><dt>Categoria</dt><dd>{bill.category}</dd></div><div><dt>Centro de custo</dt><dd>{bill.costCenter || "Não informado"}</dd></div><div><dt>Fornecedor</dt><dd>{bill.supplier}</dd></div><div><dt>CNPJ do beneficiário</dt><dd>{bill.supplierTaxId ? formatCnpj(bill.supplierTaxId) : "Não informado"}</dd></div><div><dt>Multa por atraso</dt><dd>{bill.lateFeePercent.toLocaleString("pt-BR")}% uma vez</dd></div><div><dt>Juros simples</dt><dd>{bill.monthlyInterestPercent.toLocaleString("pt-BR")}% ao mês</dd></div><div><dt>Prazo para protesto</dt><dd>{bill.protestDays ? `${bill.protestDays} ${bill.protestDays === 1 ? "dia" : "dias"} após o vencimento` : "Sem prazo informado"}</dd></div><div><dt>Código de barras</dt><dd className="barcode">{bill.barcode || "Não informado"}</dd></div><div><dt>Observações</dt><dd>{bill.notes || "Nenhuma observação"}</dd></div></dl></section>
        <section className={`document-box ${bill.attachmentPath ? "has-document" : ""}`}><FileText size={22}/><div><strong>{bill.attachmentPath ? "PDF do boleto anexado" : "Nenhum arquivo anexado"}</strong><small>{bill.attachmentPath ? "Arquivo armazenado com acesso protegido." : "Anexe um PDF no cadastro para consultá-lo aqui."}</small></div>{bill.attachmentPath && <button onClick={onOpenPdf} aria-label="Abrir PDF do boleto"><Download size={17}/></button>}</section>
        <section className="timeline"><h3>Histórico</h3><div><i className="done"><Check size={11}/></i><p><strong>Boleto cadastrado</strong><span>Por {workspace.userName}</span></p></div>{bill.status === "Lembrete enviado" && <div><i className="done"><Send size={11}/></i><p><strong>Lembrete preparado no WhatsApp</strong><span>Para {workspace.financeContactName || "o responsável financeiro"}</span></p></div>}<div><i><Clock3 size={11}/></i><p><strong>{bill.databaseStatus === "paid" ? "Pagamento concluído" : "Aguardando pagamento"}</strong><span>Responsável: Financeiro</span></p></div></section>
      </aside>
    </div>
  );
}
