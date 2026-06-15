"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button, Badge, Table, Tr, Td } from "@/components/ui";
import { api, TaxiAssociation, AssociationPayout, hasPermission } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Building2, Plus, X, Edit2, Trash2, Users, DollarSign,
  ChevronRight, CreditCard, TrendingUp, Calendar, CheckCircle2,
  ArrowLeft, Search, RefreshCw, Download, Banknote, Phone,
  Mail, MapPin, FileText, Clock, AlertCircle, Zap, ToggleLeft,
  ToggleRight, Play, Settings,
} from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  "Content-Type": "application/json",
});

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ordinal = (n: number) => ["th","st","nd","rd"][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] || "th";
const AGREEMENT_LABELS: Record<string, string> = {
  per_driver: "Per Driver (monthly)",
  fixed: "Fixed Monthly",
  percentage: "% of Revenue",
};

type Tab = "overview" | "drivers" | "revenue" | "payouts";

export default function TaxiAssociationsPage() {
  const router = useRouter();
  const [associations, setAssociations] = useState<TaxiAssociation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TaxiAssociation | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  // Detail data
  const [drivers, setDrivers] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<{ monthly: any[]; totals: any } | null>(null);
  const [payouts, setPayouts] = useState<AssociationPayout[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxiAssociation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", registration_number: "", contact_name: "", contact_phone: "",
    contact_email: "", province: "", city: "", bank_name: "",
    account_number: "", account_holder: "", branch_code: "",
    agreement_type: "per_driver", agreement_amount: "",
    auto_pay_enabled: false, auto_pay_day: "25", auto_pay_amount: "",
    notes: "",
  });

  // Payout modal
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutMonth, setPayoutMonth] = useState(new Date().getMonth() + 1);
  const [payoutYear, setPayoutYear] = useState(new Date().getFullYear());
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [creatingPayout, setCreatingPayout] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [periodRevenue, setPeriodRevenue] = useState<any | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [payNowModal, setPayNowModal] = useState<TaxiAssociation | null>(null);
  const [payNowRevenue, setPayNowRevenue] = useState<any | null>(null);
  const [payNowLoading, setPayNowLoading] = useState(false);
  const [payNowAmount, setPayNowAmount] = useState("");
  const [payNowNotes, setPayNowNotes] = useState("");
  const [paying, setPaying] = useState(false);
  const [processingAuto, setProcessingAuto] = useState(false);

  const canManage = hasPermission("manage_drivers");

  useEffect(() => {
    if (!hasPermission("manage_drivers") && !hasPermission("view_analytics")) {
      router.push("/admin/dashboard");
      return;
    }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.taxiAssociations();
      setAssociations(r.data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const loadDetail = async (assoc: TaxiAssociation, activeTab: Tab = tab) => {
    setDetailLoading(true);
    try {
      if (activeTab === "drivers") {
        const r = await api.associationDrivers(assoc.id);
        setDrivers(r.data);
      } else if (activeTab === "revenue") {
        const r = await api.associationRevenue(assoc.id, 12);
        setRevenue(r.data);
      } else if (activeTab === "payouts") {
        const r = await api.associationPayouts(assoc.id);
        setPayouts(r.data);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setDetailLoading(false); }
  };

  const selectAssoc = (assoc: TaxiAssociation) => {
    setSelected(assoc);
    setTab("overview");
    setDrivers([]);
    setRevenue(null);
    setPayouts([]);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    if (selected) loadDetail(selected, t);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "", registration_number: "", contact_name: "", contact_phone: "",
      contact_email: "", province: "", city: "", bank_name: "",
      account_number: "", account_holder: "", branch_code: "",
      agreement_type: "per_driver", agreement_amount: "",
      auto_pay_enabled: false, auto_pay_day: "25", auto_pay_amount: "",
      notes: "",
    });
    setShowForm(true);
  };

  const openEdit = (assoc: TaxiAssociation) => {
    setEditing(assoc);
    setForm({
      name: assoc.name,
      registration_number: assoc.registration_number || "",
      contact_name: assoc.contact_name || "",
      contact_phone: assoc.contact_phone || "",
      contact_email: assoc.contact_email || "",
      province: assoc.province || "",
      city: assoc.city || "",
      bank_name: assoc.bank_name || "",
      account_number: assoc.account_number || "",
      account_holder: assoc.account_holder || "",
      branch_code: assoc.branch_code || "",
      agreement_type: assoc.agreement_type || "per_driver",
      agreement_amount: String(assoc.agreement_amount || ""),
      auto_pay_enabled: assoc.auto_pay_enabled || false,
      auto_pay_day: String(assoc.auto_pay_day || "25"),
      auto_pay_amount: assoc.auto_pay_amount !== null && assoc.auto_pay_amount !== undefined ? String(assoc.auto_pay_amount) : "",
      notes: assoc.notes || "",
    });
    setShowForm(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) { toast.error("Association name is required"); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        agreement_type: form.agreement_type as "per_driver" | "fixed" | "percentage",
        agreement_amount: parseFloat(form.agreement_amount) || 0,
        auto_pay_day: parseInt(form.auto_pay_day) || 25,
        auto_pay_amount: form.auto_pay_amount ? parseFloat(form.auto_pay_amount) : null,
      };
      if (editing) {
        await api.updateTaxiAssociation(editing.id, body);
        toast.success("Association updated");
      } else {
        await api.createTaxiAssociation(body);
        toast.success("Association created");
      }
      setShowForm(false);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const deleteAssoc = async (assoc: TaxiAssociation) => {
    if (!confirm(`Delete "${assoc.name}"? All drivers will be unlinked.`)) return;
    try {
      await api.deleteTaxiAssociation(assoc.id);
      toast.success("Deleted");
      if (selected?.id === assoc.id) setSelected(null);
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const fetchPeriodRevenue = useCallback(async (assoc: TaxiAssociation, month: number, year: number) => {
    setPeriodLoading(true);
    setPeriodRevenue(null);
    try {
      const r = await api.associationRevenuePeriod(assoc.id, month, year);
      const data = r.data;
      setPeriodRevenue(data.totals);
      // Auto-fill amount based on agreement type
      if (assoc.agreement_type === "percentage") {
        const cut = (data.totals.tnr_revenue || 0) * (assoc.agreement_amount / 100);
        setPayoutAmount(cut.toFixed(2));
      } else if (assoc.agreement_type === "per_driver") {
        setPayoutAmount((assoc.agreement_amount * (assoc.driver_count || 0)).toFixed(2));
      } else if (assoc.agreement_type === "fixed") {
        setPayoutAmount(assoc.agreement_amount.toFixed(2));
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setPeriodLoading(false); }
  }, []);

  const openPayoutModal = (assoc: TaxiAssociation) => {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    setPayoutMonth(month);
    setPayoutYear(year);
    setPayoutAmount("");
    setPayoutNotes("");
    setPeriodRevenue(null);
    setShowPayoutModal(true);
    fetchPeriodRevenue(assoc, month, year);
  };

  const nextAutoPayDate = (assoc: TaxiAssociation): string => {
    if (!assoc.auto_pay_enabled || !assoc.auto_pay_day) return "";
    const day = assoc.auto_pay_day;
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
    const d = thisMonth > now ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, day);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };

  const openPayNow = async (assoc: TaxiAssociation) => {
    setPayNowModal(assoc);
    setPayNowRevenue(null);
    setPayNowAmount("");
    setPayNowNotes("");
    setPayNowLoading(true);
    try {
      const now = new Date();
      const r = await api.associationRevenuePeriod(assoc.id, now.getMonth() + 1, now.getFullYear());
      setPayNowRevenue(r.data.totals);
      const tnrRev = r.data.totals?.tnr_revenue || 0;
      let suggested = 0;
      if (assoc.auto_pay_amount !== null && assoc.auto_pay_amount !== undefined) {
        suggested = assoc.auto_pay_amount;
      } else if (assoc.agreement_type === "percentage") {
        suggested = tnrRev * (assoc.agreement_amount / 100);
      } else if (assoc.agreement_type === "per_driver") {
        suggested = assoc.agreement_amount * (assoc.driver_count || 0);
      } else {
        suggested = assoc.agreement_amount;
      }
      setPayNowAmount(suggested.toFixed(2));
    } catch (e: any) { toast.error(e.message); }
    finally { setPayNowLoading(false); }
  };

  const confirmPayNow = async () => {
    if (!payNowModal) return;
    if (!payNowAmount || isNaN(parseFloat(payNowAmount))) {
      toast.error("Enter a valid amount"); return;
    }
    if (!payNowModal.bank_name || !payNowModal.account_number) {
      toast.error("Add banking details to this association first"); return;
    }
    setPaying(true);
    try {
      const now = new Date();
      const r = await api.payAssociationNow(payNowModal.id, {
        period_month: now.getMonth() + 1,
        period_year: now.getFullYear(),
        amount: parseFloat(payNowAmount),
        notes: payNowNotes.trim() || undefined,
      });
      toast.success(`Paid ${formatZAR(r.data.amount)} to ${payNowModal.name} — Ref: ${r.data.reference}`);
      setPayNowModal(null);
      await load();
      if (selected?.id === payNowModal.id) {
        const r2 = await api.associationPayouts(payNowModal.id);
        setPayouts(r2.data);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setPaying(false); }
  };

  const runAutoPayments = async () => {
    if (!confirm("Run auto-payments for all associations due today?")) return;
    setProcessingAuto(true);
    try {
      const r = await api.processAutoPayments();
      const paid = r.data.results.filter((x: any) => x.paid).length;
      const skipped = r.data.results.filter((x: any) => x.skipped).length;
      const errors = r.data.results.filter((x: any) => x.error).length;
      toast.success(`Auto-pay complete: ${paid} paid, ${skipped} skipped, ${errors} errors`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessingAuto(false); }
  };

  const createPayout = async () => {
    if (!selected) return;
    if (!payoutAmount || isNaN(parseFloat(payoutAmount))) {
      toast.error("Enter a valid payout amount"); return;
    }
    setCreatingPayout(true);
    try {
      const r = await api.createAssociationPayout(selected.id, {
        period_month: payoutMonth,
        period_year: payoutYear,
        payout_amount: parseFloat(payoutAmount),
        notes: payoutNotes.trim() || undefined,
      });
      toast.success(`Payout recorded — Ref: ${r.data.reference}`);
      setShowPayoutModal(false);
      setPayoutAmount("");
      setPayoutNotes("");
      const r2 = await api.associationPayouts(selected.id);
      setPayouts(r2.data);
    } catch (e: any) { toast.error(e.message); }
    finally { setCreatingPayout(false); }
  };

  const markPaid = async (payout: AssociationPayout) => {
    if (!selected) return;
    setMarkingPaid(payout.id);
    try {
      await api.markPayoutPaid(selected.id, payout.id);
      toast.success("Marked as paid");
      const r = await api.associationPayouts(selected.id);
      setPayouts(r.data);
    } catch (e: any) { toast.error(e.message); }
    finally { setMarkingPaid(null); }
  };

  const filtered = useMemo(() =>
    associations.filter(a =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.province || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.city || "").toLowerCase().includes(search.toLowerCase())
    ), [associations, search]);

  const totalDrivers = associations.reduce((s, a) => s + (a.driver_count || 0), 0);
  const activeAssociations = associations.filter(a => a.is_active).length;

  const computedPayout = useMemo(() => {
    if (!selected) return 0;
    if (selected.agreement_type === "fixed") return selected.agreement_amount;
    if (selected.agreement_type === "per_driver") return selected.agreement_amount * (selected.driver_count || 0);
    if (selected.agreement_type === "percentage" && periodRevenue) {
      return (periodRevenue.tnr_revenue || 0) * (selected.agreement_amount / 100);
    }
    return 0;
  }, [selected, periodRevenue]);

  if (loading) return <AdminShell title="Taxi Associations"><Spinner /></AdminShell>;

  return (
    <AdminShell title="Taxi Associations">
      <div className="flex flex-col gap-6">

        {/* ── Top action bar ── */}
        {canManage && (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={runAutoPayments}
              disabled={processingAuto}
              className="border-green/30 text-green hover:bg-green/10">
              {processingAuto ? <Spinner /> : <Zap size={13} fill="currentColor" />}
              Run Auto-Payments
            </Button>
          </div>
        )}

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Associations", value: associations.length, color: "text-cyan", icon: Building2 },
            { label: "Active", value: activeAssociations, color: "text-green", icon: CheckCircle2 },
            { label: "Total Drivers", value: totalDrivers, color: "text-yellow", icon: Users },
            { label: "Pending Payouts", value: 0, color: "text-orange-400", icon: Clock },
          ].map(s => (
            <Card key={s.label}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-bg3 flex items-center justify-center flex-shrink-0`}>
                  <s.icon size={16} className={s.color} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{s.label}</p>
                  <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Association list ── */}
          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search associations..."
                  className="w-full bg-bg2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                />
              </div>
              {canManage && (
                <Button onClick={openCreate} className="flex-shrink-0">
                  <Plus size={13} /> New
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <div className="text-center py-10 text-textMuted text-sm">
                  {search ? "No results" : "No associations yet"}
                </div>
              )}
              {filtered.map(assoc => (
                <button key={assoc.id} onClick={() => selectAssoc(assoc)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selected?.id === assoc.id
                      ? "bg-cyan/10 border-cyan/30"
                      : "bg-bg2 border-border hover:border-cyan/20"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-text text-sm truncate">{assoc.name}</p>
                      {(assoc.city || assoc.province) && (
                        <p className="text-textMuted text-xs mt-0.5 flex items-center gap-1">
                          <MapPin size={10} />
                          {[assoc.city, assoc.province].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge
                        label={assoc.is_active ? "Active" : "Inactive"}
                        tone={assoc.is_active ? "green" : "muted"}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border flex-wrap">
                    <div className="flex items-center gap-1 text-xs text-textMuted">
                      <Users size={11} className="text-yellow" />
                      <span className="font-semibold text-text">{assoc.driver_count || 0}</span>
                    </div>
                    {assoc.auto_pay_enabled ? (
                      <div className="flex items-center gap-1 text-xs text-green font-semibold">
                        <Zap size={10} fill="currentColor" />
                        Auto {assoc.auto_pay_day}{ordinal(assoc.auto_pay_day || 25)}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-textDim">
                        <Clock size={10} /> Manual
                      </div>
                    )}
                    {canManage && (
                      <button
                        onClick={e => { e.stopPropagation(); openPayNow(assoc); }}
                        className="ml-auto flex items-center gap-1 text-xs font-bold text-green bg-green/10 hover:bg-green/20 px-2 py-1 rounded-lg transition-colors border border-green/20">
                        <Play size={9} fill="currentColor" /> Pay Now
                      </button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Detail panel ── */}
          <div className="flex-1 min-w-0">
            {!selected ? (
              <Card>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Building2 size={40} className="text-textDim mb-4" />
                  <p className="text-textMuted font-semibold">Select an association</p>
                  <p className="text-textDim text-sm mt-1">Click any association on the left to view details</p>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">

                {/* Header */}
                <Card>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-text font-extrabold text-xl">{selected.name}</h2>
                        <Badge
                          label={selected.is_active ? "Active" : "Inactive"}
                          tone={selected.is_active ? "green" : "muted"}
                        />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        {selected.registration_number && (
                          <span className="text-textMuted text-xs">Reg: <span className="text-text font-mono">{selected.registration_number}</span></span>
                        )}
                        {selected.contact_phone && (
                          <span className="text-textMuted text-xs flex items-center gap-1">
                            <Phone size={10} /> {selected.contact_phone}
                          </span>
                        )}
                        {selected.contact_email && (
                          <span className="text-textMuted text-xs flex items-center gap-1">
                            <Mail size={10} /> {selected.contact_email}
                          </span>
                        )}
                        {(selected.city || selected.province) && (
                          <span className="text-textMuted text-xs flex items-center gap-1">
                            <MapPin size={10} /> {[selected.city, selected.province].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        <Button onClick={() => openPayNow(selected)} className="bg-green/20 text-green border border-green/30 hover:bg-green/30">
                          <Play size={13} fill="currentColor" /> Pay Now
                        </Button>
                        <Button variant="secondary" onClick={() => openEdit(selected)}>
                          <Edit2 size={13} /> Edit
                        </Button>
                        <Button variant="ghost" onClick={() => deleteAssoc(selected)} className="text-red hover:bg-red/10">
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Drivers</p>
                      <p className="text-2xl font-extrabold text-yellow">{selected.driver_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Agreement</p>
                      <p className="text-sm font-bold text-cyan">{AGREEMENT_LABELS[selected.agreement_type]}</p>
                      <p className="text-textMuted text-xs">{formatZAR(selected.agreement_amount)} {selected.agreement_type === "percentage" ? "%" : ""}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">This Month's Payout</p>
                      <p className="text-2xl font-extrabold text-green">
                        {selected.agreement_type === "percentage" && !periodRevenue
                          ? `${selected.agreement_amount}% of revenue`
                          : formatZAR(computedPayout)}
                      </p>
                      <p className="text-textDim text-[10px]">
                        {selected.agreement_type === "percentage" && periodRevenue
                          ? `${selected.agreement_amount}% of ${formatZAR(periodRevenue.tnr_revenue)}`
                          : "calculated from agreement"}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Tabs */}
                <div className="flex gap-1 bg-bg2 border border-border rounded-xl p-1">
                  {(["overview","drivers","revenue","payouts"] as Tab[]).map(t => (
                    <button key={t} onClick={() => switchTab(t)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                        tab === t ? "bg-cyan text-bg" : "text-textMuted hover:text-text"
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                {tab === "overview" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <h3 className="text-text font-bold mb-4 flex items-center gap-2">
                        <Banknote size={15} className="text-green" /> Banking Details
                      </h3>
                      {selected.bank_name || selected.account_number ? (
                        <div className="space-y-3">
                          {[
                            { label: "Bank", value: selected.bank_name },
                            { label: "Account Holder", value: selected.account_holder },
                            { label: "Account Number", value: selected.account_number },
                            { label: "Branch Code", value: selected.branch_code },
                          ].map(row => row.value && (
                            <div key={row.label} className="flex justify-between items-center text-sm">
                              <span className="text-textMuted">{row.label}</span>
                              <span className="text-text font-semibold font-mono">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-textDim text-sm">No banking details on file.{canManage && " Click Edit to add."}</p>
                      )}
                    </Card>

                    <Card>
                      <h3 className="text-text font-bold mb-4 flex items-center gap-2">
                        <FileText size={15} className="text-cyan" /> Agreement
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-textMuted">Type</span>
                          <span className="text-cyan font-bold">{AGREEMENT_LABELS[selected.agreement_type]}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-textMuted">Amount</span>
                          <span className="text-text font-bold">
                            {selected.agreement_type === "percentage"
                              ? `${selected.agreement_amount}%`
                              : formatZAR(selected.agreement_amount)}
                          </span>
                        </div>
                        {selected.agreement_type !== "percentage" && (
                          <div className="flex justify-between text-sm">
                            <span className="text-textMuted">This month ({selected.driver_count} drivers)</span>
                            <span className="text-green font-bold">{formatZAR(computedPayout)}</span>
                          </div>
                        )}
                      </div>
                      {selected.notes && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <p className="text-textMuted text-xs mb-1">Notes</p>
                          <p className="text-text text-sm">{selected.notes}</p>
                        </div>
                      )}
                    </Card>

                    <Card>
                      <h3 className="text-text font-bold mb-4 flex items-center gap-2">
                        <Zap size={15} className="text-green" fill="currentColor" /> Auto-Payment Schedule
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-textMuted text-sm">Auto-pay</span>
                          <div className="flex items-center gap-2">
                            {selected.auto_pay_enabled
                              ? <><ToggleRight size={20} className="text-green" /><span className="text-green font-bold text-sm">Enabled</span></>
                              : <><ToggleLeft size={20} className="text-textDim" /><span className="text-textDim text-sm">Disabled</span></>
                            }
                          </div>
                        </div>
                        {selected.auto_pay_enabled && (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-textMuted">Payment day</span>
                              <span className="text-text font-bold">{selected.auto_pay_day}{ordinal(selected.auto_pay_day || 25)} of every month</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-textMuted">Amount</span>
                              <span className="text-text font-bold">
                                {selected.auto_pay_amount !== null && selected.auto_pay_amount !== undefined
                                  ? formatZAR(selected.auto_pay_amount) + " (fixed override)"
                                  : "Calculated from agreement"}
                              </span>
                            </div>
                            <div className="mt-2 p-3 bg-green/5 border border-green/20 rounded-lg">
                              <p className="text-xs text-green font-bold flex items-center gap-1">
                                <Calendar size={11} /> Next auto-payment
                              </p>
                              <p className="text-text font-extrabold mt-1">{nextAutoPayDate(selected)}</p>
                            </div>
                          </>
                        )}
                        {!selected.auto_pay_enabled && (
                          <p className="text-textDim text-xs">Enable auto-pay in Edit to schedule monthly payments automatically.</p>
                        )}
                      </div>
                    </Card>

                    <Card className="md:col-span-2">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-text font-bold flex items-center gap-2">
                          <DollarSign size={15} className="text-yellow" /> Contact Person
                        </h3>
                      </div>
                      {selected.contact_name ? (
                        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                          <div><span className="text-textMuted">Name: </span><span className="text-text font-semibold">{selected.contact_name}</span></div>
                          {selected.contact_phone && <div><span className="text-textMuted">Phone: </span><span className="text-text font-mono">{selected.contact_phone}</span></div>}
                          {selected.contact_email && <div><span className="text-textMuted">Email: </span><span className="text-text">{selected.contact_email}</span></div>}
                        </div>
                      ) : (
                        <p className="text-textDim text-sm">No contact person recorded.</p>
                      )}
                    </Card>
                  </div>
                )}

                {tab === "drivers" && (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-text font-bold">
                        Drivers ({drivers.length || selected.driver_count || 0})
                      </h3>
                      <Button variant="secondary" onClick={() => loadDetail(selected, "drivers")}>
                        <RefreshCw size={12} /> Refresh
                      </Button>
                    </div>
                    {detailLoading ? <Spinner /> : (
                      drivers.length === 0 ? (
                        <div className="text-center py-10">
                          <Users size={32} className="text-textDim mx-auto mb-3" />
                          <p className="text-textMuted text-sm">No drivers linked to this association yet.</p>
                          <p className="text-textDim text-xs mt-1">Assign drivers from the Drivers section.</p>
                        </div>
                      ) : (
                        <Table
                          headers={["Driver", "Phone", "Rides", "Total Revenue", "Platform Fees", "Status"]}
                          empty={false}>
                          {drivers.map((d: any) => (
                            <Tr key={d.id}>
                              <Td className="font-semibold text-text">{d.full_name}</Td>
                              <Td className="font-mono text-textMuted text-xs">{d.phone_number}</Td>
                              <Td className="text-cyan font-bold">{d.ride_count}</Td>
                              <Td className="font-bold text-green">{formatZAR(d.total_ride_revenue)}</Td>
                              <Td className="font-bold text-yellow">{formatZAR(d.total_platform_fees)}</Td>
                              <Td>
                                <Badge
                                  label={d.is_active ? "Active" : "Inactive"}
                                  tone={d.is_active ? "green" : "muted"}
                                />
                              </Td>
                            </Tr>
                          ))}
                        </Table>
                      )
                    )}
                  </Card>
                )}

                {tab === "revenue" && (
                  <div className="flex flex-col gap-4">
                    {detailLoading ? <Spinner /> : !revenue ? (
                      <Card>
                        <div className="text-center py-10">
                          <TrendingUp size={32} className="text-textDim mx-auto mb-3" />
                          <p className="text-textMuted text-sm">Click Refresh to load revenue data.</p>
                          <Button className="mt-4" onClick={() => loadDetail(selected, "revenue")}>Load Revenue</Button>
                        </div>
                      </Card>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { label: "Total Rides", value: revenue.totals.total_rides?.toLocaleString() || "0", color: "text-cyan" },
                            { label: "Total Ride Revenue", value: formatZAR(revenue.totals.ride_revenue || 0), color: "text-green" },
                            { label: "Platform Fees (All Time)", value: formatZAR(revenue.totals.platform_fees || 0), color: "text-yellow" },
                            { label: "Linked Drivers", value: revenue.totals.driver_count, color: "text-purple" },
                          ].map(s => (
                            <Card key={s.label}>
                              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">{s.label}</p>
                              <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                            </Card>
                          ))}
                        </div>

                        <Card>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-text font-bold">Monthly Breakdown (Last 12 Months)</h3>
                            {selected.agreement_type === "percentage" && (
                              <span className="text-xs text-cyan font-semibold bg-cyan/10 border border-cyan/20 px-2 py-1 rounded">
                                {selected.agreement_amount}% owed on TNR Revenue column
                              </span>
                            )}
                          </div>
                          {revenue.monthly.length === 0 ? (
                            <p className="text-textMuted text-sm text-center py-6">No revenue data yet.</p>
                          ) : (
                            <Table
                              headers={["Month", "Rides", "Ride Revenue", "Platform Fees", "Sub Fees", "Stmt Fees", "TNR Revenue", selected.agreement_type === "percentage" ? `${selected.agreement_amount}% Owed` : "Fixed Payout"]}
                              empty={false}>
                              {revenue.monthly.map((m: any, i: number) => {
                                const d = new Date(m.month);
                                const tnrRev = (m.platform_fees || 0) + (m.subscription_fees || 0) + (m.statement_fees || 0);
                                let owed = 0;
                                if (selected.agreement_type === "percentage") owed = tnrRev * (selected.agreement_amount / 100);
                                else if (selected.agreement_type === "per_driver") owed = selected.agreement_amount * (selected.driver_count || 0);
                                else owed = selected.agreement_amount;
                                return (
                                  <Tr key={i}>
                                    <Td className="font-bold text-text whitespace-nowrap">
                                      {MONTHS[d.getMonth()]} {d.getFullYear()}
                                    </Td>
                                    <Td className="text-cyan">{m.ride_count}</Td>
                                    <Td className="text-green font-semibold">{formatZAR(m.ride_revenue)}</Td>
                                    <Td className="text-yellow font-semibold">{formatZAR(m.platform_fees)}</Td>
                                    <Td className="text-purple font-semibold">{formatZAR(m.subscription_fees || 0)}</Td>
                                    <Td className="text-orange-400 font-semibold">{formatZAR(m.statement_fees || 0)}</Td>
                                    <Td className="font-extrabold text-text">{formatZAR(tnrRev)}</Td>
                                    <Td className="font-extrabold text-cyan">{formatZAR(owed)}</Td>
                                  </Tr>
                                );
                              })}
                            </Table>
                          )}
                        </Card>
                      </>
                    )}
                  </div>
                )}

                {tab === "payouts" && (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-text font-bold">Payout History</h3>
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => loadDetail(selected, "payouts")}>
                          <RefreshCw size={12} />
                        </Button>
                        {canManage && (
                          <Button onClick={() => openPayoutModal(selected)}>
                            <Plus size={13} /> Record Payout
                          </Button>
                        )}
                      </div>
                    </div>

                    {detailLoading ? <Spinner /> : (
                      payouts.length === 0 ? (
                        <div className="text-center py-10">
                          <Banknote size={32} className="text-textDim mx-auto mb-3" />
                          <p className="text-textMuted text-sm">No payouts recorded yet.</p>
                          {canManage && (
                            <Button className="mt-4" onClick={() => openPayoutModal(selected)}>
                              <Plus size={13} /> Record First Payout
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {payouts.map(p => (
                            <div key={p.id}
                              className="flex items-center gap-4 p-4 bg-bg rounded-xl border border-border">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                p.status === "paid" ? "bg-green/10" : "bg-yellow/10"
                              }`}>
                                {p.status === "paid"
                                  ? <CheckCircle2 size={18} className="text-green" />
                                  : <Clock size={18} className="text-yellow" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-text text-sm">
                                    {MONTHS[(p.period_month || 1) - 1]} {p.period_year}
                                  </p>
                                  <Badge
                                    label={p.status}
                                    tone={p.status === "paid" ? "green" : p.status === "cancelled" ? "red" : "yellow"}
                                  />
                                  <span className="font-mono text-textDim text-[10px]">{p.reference}</span>
                                </div>
                                <div className="flex gap-4 mt-1 text-xs text-textMuted flex-wrap">
                                  <span>{p.driver_count} drivers</span>
                                  <span>Platform fees: {formatZAR(p.platform_fees)}</span>
                                  <span>Sub fees: {formatZAR(p.subscription_fees)}</span>
                                  <span>Revenue: {formatZAR(p.total_revenue)}</span>
                                </div>
                                {p.bank_name && (
                                  <p className="text-textDim text-[10px] mt-1">
                                    {p.bank_name} · {p.account_number} ({p.account_holder})
                                  </p>
                                )}
                                {p.notes && <p className="text-textDim text-xs mt-1 italic">{p.notes}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-green font-extrabold text-lg">{formatZAR(p.payout_amount)}</p>
                                {p.paid_at && (
                                  <p className="text-textDim text-[10px]">Paid {formatDate(p.paid_at)}</p>
                                )}
                                {p.status === "pending" && canManage && (
                                  <button
                                    onClick={() => markPaid(p)}
                                    disabled={markingPaid === p.id}
                                    className="mt-2 text-xs font-bold text-green hover:text-green/80 flex items-center gap-1 ml-auto transition-colors">
                                    {markingPaid === p.id ? <Spinner /> : <CheckCircle2 size={12} />}
                                    Mark Paid
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </Card>
                )}

              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Pay Now Modal ── */}
      {payNowModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-text font-bold flex items-center gap-2">
                  <Play size={16} className="text-green" fill="currentColor" /> Pay Now
                </h2>
                <p className="text-textMuted text-xs mt-0.5">{payNowModal.name}</p>
              </div>
              <button onClick={() => setPayNowModal(null)} className="text-textMuted hover:text-text transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">

              {/* Period label */}
              <div className="text-xs text-textMuted font-semibold">
                Period: <span className="text-text">{MONTHS[new Date().getMonth()]} {new Date().getFullYear()}</span>
              </div>

              {/* Revenue breakdown */}
              <div className="rounded-xl border border-border bg-bg overflow-hidden">
                <div className="px-4 py-3 border-b border-border text-xs font-bold text-textMuted uppercase tracking-widest flex items-center justify-between">
                  <span>Revenue from this association this month</span>
                  {payNowLoading && <Spinner />}
                </div>
                {payNowLoading ? (
                  <div className="p-4 text-center text-textDim text-xs">Loading...</div>
                ) : payNowRevenue ? (
                  <div className="divide-y divide-border">
                    <div className="flex justify-between px-4 py-2.5 text-sm">
                      <span className="text-textMuted">Platform fees</span>
                      <span className="font-bold text-yellow">{formatZAR(payNowRevenue.platform_fees || 0)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2.5 text-sm">
                      <span className="text-textMuted">Subscription fees</span>
                      <span className="font-bold text-purple">{formatZAR(payNowRevenue.subscription_fees || 0)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2.5 text-sm">
                      <span className="text-textMuted">Statement fees</span>
                      <span className="font-bold text-orange-400">{formatZAR(payNowRevenue.statement_fees || 0)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2.5 bg-bg2 font-bold text-sm">
                      <span className="text-text">Total TNR Revenue</span>
                      <span className="text-green">{formatZAR(payNowRevenue.tnr_revenue || 0)}</span>
                    </div>
                    {payNowModal.agreement_type === "percentage" && (
                      <div className="flex justify-between px-4 py-2.5 bg-cyan/5 text-sm">
                        <span className="text-cyan font-bold">{payNowModal.agreement_amount}% agreed cut</span>
                        <span className="text-cyan font-extrabold">{formatZAR((payNowRevenue.tnr_revenue || 0) * payNowModal.agreement_amount / 100)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-center text-textDim text-xs">No revenue data yet for this period.</div>
                )}
              </div>

              {/* Banking details */}
              {payNowModal.bank_name ? (
                <div className="flex items-start gap-2 p-3 bg-green/5 border border-green/20 rounded-lg text-xs">
                  <Banknote size={13} className="text-green mt-0.5 flex-shrink-0" />
                  <div className="text-textMuted">
                    <p className="font-bold text-green">Paying to:</p>
                    <p>{payNowModal.bank_name} · Acc: {payNowModal.account_number}</p>
                    <p>{payNowModal.account_holder}{payNowModal.branch_code ? ` · Branch: ${payNowModal.branch_code}` : ""}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-red/10 border border-red/20 rounded-lg text-xs text-red font-semibold">
                  <AlertCircle size={13} /> No banking details — add them in Edit before paying.
                </div>
              )}

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-textMuted font-semibold">Payout Amount (ZAR)</label>
                </div>
                <input
                  type="number" min="0" step="0.01"
                  value={payNowAmount} onChange={e => setPayNowAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-green/40 font-mono text-base"
                />
              </div>

              <div>
                <label className="text-xs text-textMuted font-semibold mb-1 block">Notes (optional)</label>
                <input
                  value={payNowNotes} onChange={e => setPayNowNotes(e.target.value)}
                  placeholder="e.g. EFT confirmed, partial..."
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button variant="ghost" onClick={() => setPayNowModal(null)}>Cancel</Button>
                <Button
                  onClick={confirmPayNow}
                  disabled={paying || !payNowAmount || !payNowModal.bank_name}
                  className="bg-green text-bg hover:bg-green/90">
                  {paying ? <Spinner /> : <Play size={13} fill="currentColor" />}
                  Pay {payNowAmount ? formatZAR(parseFloat(payNowAmount)) : ""} Now
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-bg2 z-10">
              <h2 className="text-text font-bold text-lg">
                {editing ? "Edit Association" : "New Taxi Association"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-textMuted hover:text-text transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">

              {/* Basic Info */}
              <div>
                <h3 className="text-textMuted text-xs font-bold uppercase tracking-widest mb-3">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Association Name *</label>
                    <input
                      value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Soweto Taxi Association"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Registration Number</label>
                    <input
                      value={form.registration_number} onChange={e => setForm(f => ({ ...f, registration_number: e.target.value }))}
                      placeholder="e.g. SANTACO-001"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Province</label>
                    <input
                      value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))}
                      placeholder="e.g. Gauteng"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">City / Area</label>
                    <input
                      value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="e.g. Soweto"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div>
                <h3 className="text-textMuted text-xs font-bold uppercase tracking-widest mb-3">Contact Person</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Name</label>
                    <input
                      value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                      placeholder="Full name"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Phone</label>
                    <input
                      value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                      placeholder="e.g. 083 000 0000"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Email</label>
                    <input
                      value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                      placeholder="email@example.com"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                </div>
              </div>

              {/* Banking */}
              <div>
                <h3 className="text-textMuted text-xs font-bold uppercase tracking-widest mb-3">Banking Details (for payouts)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Bank Name</label>
                    <input
                      value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                      placeholder="e.g. FNB, Nedbank"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Account Holder</label>
                    <input
                      value={form.account_holder} onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))}
                      placeholder="Name on account"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Account Number</label>
                    <input
                      value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                      placeholder="e.g. 12345678"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Branch Code</label>
                    <input
                      value={form.branch_code} onChange={e => setForm(f => ({ ...f, branch_code: e.target.value }))}
                      placeholder="e.g. 250655"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                </div>
              </div>

              {/* Agreement */}
              <div>
                <h3 className="text-textMuted text-xs font-bold uppercase tracking-widest mb-3">Payment Agreement</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">Agreement Type</label>
                    <select
                      value={form.agreement_type} onChange={e => setForm(f => ({ ...f, agreement_type: e.target.value }))}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-cyan/40">
                      <option value="per_driver">Per Driver (R per driver per month)</option>
                      <option value="fixed">Fixed Monthly Amount</option>
                      <option value="percentage">Percentage of Platform Revenue</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-textMuted font-semibold mb-1 block">
                      {form.agreement_type === "percentage" ? "Percentage (%)" : "Amount (ZAR)"}
                    </label>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.agreement_amount} onChange={e => setForm(f => ({ ...f, agreement_amount: e.target.value }))}
                      placeholder={form.agreement_type === "percentage" ? "e.g. 5" : "e.g. 500"}
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                    />
                  </div>
                </div>
                {form.agreement_type !== "percentage" && form.agreement_amount && (
                  <p className="text-textMuted text-xs mt-2 flex items-center gap-1">
                    <AlertCircle size={11} />
                    {form.agreement_type === "per_driver"
                      ? `With ${selected?.driver_count || 0} drivers: ${formatZAR((parseFloat(form.agreement_amount) || 0) * (selected?.driver_count || 0))}/month`
                      : `Fixed monthly payout: ${formatZAR(parseFloat(form.agreement_amount) || 0)}`}
                  </p>
                )}
              </div>

              {/* Auto-pay */}
              <div>
                <h3 className="text-textMuted text-xs font-bold uppercase tracking-widest mb-3">Auto-Payment Schedule</h3>
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, auto_pay_enabled: !f.auto_pay_enabled }))}
                    className={`flex items-center gap-3 w-full p-3 rounded-xl border transition-all ${
                      form.auto_pay_enabled
                        ? "bg-green/10 border-green/30"
                        : "bg-bg border-border"
                    }`}>
                    {form.auto_pay_enabled
                      ? <ToggleRight size={22} className="text-green flex-shrink-0" />
                      : <ToggleLeft size={22} className="text-textDim flex-shrink-0" />}
                    <div className="text-left">
                      <p className={`text-sm font-bold ${form.auto_pay_enabled ? "text-green" : "text-textMuted"}`}>
                        {form.auto_pay_enabled ? "Auto-payment enabled" : "Auto-payment disabled"}
                      </p>
                      <p className="text-textDim text-xs">System will pay automatically each month on the configured day</p>
                    </div>
                  </button>

                  {form.auto_pay_enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-1">
                      <div>
                        <label className="text-xs text-textMuted font-semibold mb-1 block">
                          Payment Day (1–28)
                        </label>
                        <input
                          type="number" min="1" max="28"
                          value={form.auto_pay_day}
                          onChange={e => setForm(f => ({ ...f, auto_pay_day: e.target.value }))}
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-cyan/40"
                        />
                        <p className="text-textDim text-xs mt-1">
                          Pays on the {parseInt(form.auto_pay_day) || 25}{ordinal(parseInt(form.auto_pay_day) || 25)} of every month
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-textMuted font-semibold mb-1 block">
                          Fixed Amount Override (ZAR) — optional
                        </label>
                        <input
                          type="number" min="0" step="0.01"
                          value={form.auto_pay_amount}
                          onChange={e => setForm(f => ({ ...f, auto_pay_amount: e.target.value }))}
                          placeholder="Leave blank to use agreement calculation"
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                        />
                        <p className="text-textDim text-xs mt-1">
                          {form.auto_pay_amount
                            ? `Will always pay exactly ${formatZAR(parseFloat(form.auto_pay_amount) || 0)}`
                            : "Will calculate from agreement each month"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-textMuted font-semibold mb-1 block">Notes</label>
                <textarea
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} placeholder="Any special agreement terms or notes..."
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={saveForm} disabled={saving}>
                  {saving ? <Spinner /> : <CheckCircle2 size={13} />}
                  {editing ? "Save Changes" : "Create Association"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Payout Modal ── */}
      {showPayoutModal && selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-text font-bold">Record Monthly Payout</h2>
                <p className="text-textMuted text-xs mt-0.5">{selected.name}</p>
              </div>
              <button onClick={() => setShowPayoutModal(false)} className="text-textMuted hover:text-text transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">

              {/* Period selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-textMuted font-semibold mb-1 block">Month</label>
                  <select
                    value={payoutMonth}
                    onChange={e => {
                      const m = Number(e.target.value);
                      setPayoutMonth(m);
                      fetchPeriodRevenue(selected, m, payoutYear);
                    }}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-cyan/40">
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-textMuted font-semibold mb-1 block">Year</label>
                  <select
                    value={payoutYear}
                    onChange={e => {
                      const y = Number(e.target.value);
                      setPayoutYear(y);
                      fetchPeriodRevenue(selected, payoutMonth, y);
                    }}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-cyan/40">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Revenue breakdown for this period */}
              <div className="rounded-xl border border-border bg-bg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p className="text-xs font-bold text-textMuted uppercase tracking-widest">
                    TNR Revenue from {selected.name} — {MONTHS[payoutMonth - 1]} {payoutYear}
                  </p>
                  {periodLoading && <Spinner />}
                </div>
                {periodLoading ? (
                  <div className="p-4 text-center text-textMuted text-xs">Loading revenue data...</div>
                ) : periodRevenue ? (
                  <div className="divide-y divide-border">
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-textMuted">Platform fees (ride commissions)</span>
                      <span className="font-bold text-yellow">{formatZAR(periodRevenue.platform_fees || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-textMuted">Subscription fees</span>
                      <span className="font-bold text-purple">{formatZAR(periodRevenue.subscription_fees || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-textMuted">Statement fees</span>
                      <span className="font-bold text-orange-400">{formatZAR(periodRevenue.statement_fees || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3 bg-bg2">
                      <span className="text-text font-bold">Total TNR Revenue</span>
                      <span className="font-extrabold text-green text-base">{formatZAR(periodRevenue.tnr_revenue || 0)}</span>
                    </div>
                    {selected.agreement_type === "percentage" && (
                      <div className="flex justify-between items-center px-4 py-3 bg-cyan/5 border-t border-cyan/20">
                        <div>
                          <p className="text-cyan font-bold text-sm">Their {selected.agreement_amount}% cut</p>
                          <p className="text-textDim text-xs">{formatZAR(periodRevenue.tnr_revenue || 0)} × {selected.agreement_amount}%</p>
                        </div>
                        <span className="font-extrabold text-cyan text-xl">{formatZAR(computedPayout)}</span>
                      </div>
                    )}
                    {selected.agreement_type === "per_driver" && (
                      <div className="flex justify-between items-center px-4 py-3 bg-cyan/5 border-t border-cyan/20">
                        <div>
                          <p className="text-cyan font-bold text-sm">Per-driver fee</p>
                          <p className="text-textDim text-xs">{selected.driver_count} drivers × {formatZAR(selected.agreement_amount)}</p>
                        </div>
                        <span className="font-extrabold text-cyan text-xl">{formatZAR(computedPayout)}</span>
                      </div>
                    )}
                    {selected.agreement_type === "fixed" && (
                      <div className="flex justify-between items-center px-4 py-3 bg-cyan/5 border-t border-cyan/20">
                        <p className="text-cyan font-bold text-sm">Fixed monthly payout</p>
                        <span className="font-extrabold text-cyan text-xl">{formatZAR(selected.agreement_amount)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-center text-textDim text-xs">No revenue data for this period.</div>
                )}
              </div>

              {/* Amount override */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-textMuted font-semibold">Payout Amount (ZAR)</label>
                  {computedPayout > 0 && parseFloat(payoutAmount) !== computedPayout && (
                    <button
                      onClick={() => setPayoutAmount(computedPayout.toFixed(2))}
                      className="text-xs text-cyan hover:text-cyan/80 transition-colors">
                      Reset to calculated ({formatZAR(computedPayout)})
                    </button>
                  )}
                </div>
                <input
                  type="number" min="0" step="0.01"
                  value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40 font-mono"
                />
                <p className="text-textDim text-xs mt-1">You can override the amount if the agreement differs.</p>
              </div>

              {/* Bank details reminder */}
              {selected.bank_name && (
                <div className="flex items-start gap-2 p-3 bg-green/5 border border-green/20 rounded-lg text-xs text-textMuted">
                  <Banknote size={13} className="text-green mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-green">Payment will be sent to:</p>
                    <p className="mt-0.5">{selected.bank_name} · {selected.account_number}</p>
                    <p>{selected.account_holder}{selected.branch_code ? ` · Branch: ${selected.branch_code}` : ""}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-textMuted font-semibold mb-1 block">Notes (optional)</label>
                <input
                  value={payoutNotes} onChange={e => setPayoutNotes(e.target.value)}
                  placeholder="e.g. EFT ref, partial payment, deductions..."
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-cyan/40"
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button variant="ghost" onClick={() => setShowPayoutModal(false)}>Cancel</Button>
                <Button onClick={createPayout} disabled={creatingPayout || !payoutAmount}>
                  {creatingPayout ? <Spinner /> : <Banknote size={13} />}
                  Record Payout — {payoutAmount ? formatZAR(parseFloat(payoutAmount)) : "R0"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
