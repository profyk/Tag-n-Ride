"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Modal, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Target, Tag, Users2, Send, Megaphone, Star, TrendingUp,
  Gift, MessageCircle, Bell, Plus, Zap, Award, Trash2, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 12,
  },
};

const TONE_COLORS: Record<string, string> = {
  active: "green", expired: "red", paused: "yellow", draft: "cyan",
};

const CHANNEL_COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A", "#FF8C42"];

export default function MarketingPage() {
  const [promos, setPromos] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any>(null);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [deletePromoId, setDeletePromoId] = useState<string | null>(null);

  // Promo form
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState("");
  const [promoType, setPromoType] = useState("percent");
  const [promoMax, setPromoMax] = useState("");
  const [promoExpiry, setPromoExpiry] = useState("");
  const [promoRole, setPromoRole] = useState("passenger");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, r, b] = await Promise.all([
        api.promotions(),
        api.referrals({}),
        api.broadcasts(),
      ]);
      setPromos(Array.isArray(p.data) ? p.data : []);
      setReferrals(r.data);
      setBroadcasts(Array.isArray(b.data) ? b.data : []);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreatePromo = async () => {
    if (!promoCode.trim() || !promoDiscount) { toast.error("Code and discount required"); return; }
    setSaving(true);
    try {
      await api.createPromotion({
        code: promoCode.trim().toUpperCase(),
        discount_value: parseFloat(promoDiscount),
        discount_type: promoType as any,
        max_uses: promoMax ? parseInt(promoMax) : undefined,
        expires_at: promoExpiry || undefined,
        target_role: promoRole || undefined,
      });
      toast.success("Promotion created");
      setCreateModal(false);
      setPromoCode(""); setPromoDiscount(""); setPromoMax(""); setPromoExpiry("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleTogglePromo = async (promo: any) => {
    try {
      await api.updatePromotion(promo.id, { active: !promo.active });
      toast.success(promo.active ? "Promotion paused" : "Promotion activated");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeletePromo = (id: string) => { setDeletePromoId(id); };
  const confirmDeletePromo = async () => {
    if (!deletePromoId) return;
    const id = deletePromoId; setDeletePromoId(null);
    try {
      await api.deletePromotion(id);
      toast.success("Promotion deleted");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const activePromos = promos.filter(p => p.active).length;
  const totalUses = promos.reduce((s, p) => s + (p.use_count || 0), 0);
  const totalSavings = promos.reduce((s, p) => s + (p.total_savings || 0), 0);

  const refStats = referrals?.stats || {};
  const refItems = referrals?.items ?? [];
  const topReferrers = refItems.slice(0, 6).map((r: any) => ({
    name: r.referrer_name || "User",
    referrals: r.referral_count || 0,
  }));

  const channelData = [
    { name: "Promotions", value: totalUses },
    { name: "Referrals", value: refStats.total_referrals || 0 },
    { name: "Broadcasts", value: broadcasts.length * 10 },
    { name: "Organic", value: Math.max(0, (broadcasts.length * 40)) },
  ];

  if (loading) return <AdminShell title="Marketing"><Spinner /></AdminShell>;

  return (
    <AdminShell title="Marketing">
      <div className="space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Tag, label: "Active Promos", value: activePromos, color: "text-cyan", bg: "bg-cyan/10 border-cyan/20" },
            { icon: Zap, label: "Total Promo Uses", value: totalUses.toLocaleString(), color: "text-green", bg: "bg-green/10 border-green/20" },
            { icon: Gift, label: "Total Savings", value: formatZAR(totalSavings), color: "text-purple", bg: "bg-purple/10 border-purple/20" },
            { icon: Users2, label: "Referrals", value: refStats.total_referrals || 0, color: "text-yellow", bg: "bg-yellow/10 border-yellow/20" },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className={`rounded-2xl border p-5 ${bg}`}>
              <Icon size={18} className={`${color} mb-2`} />
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setCreateModal(true)}>
            <Plus size={13} /> New Promotion
          </Button>
          <Button variant="secondary" onClick={() => window.location.href = "/admin/notifications"}>
            <Megaphone size={13} /> Send Broadcast
          </Button>
          <Button variant="secondary" onClick={() => window.location.href = "/admin/referrals"}>
            <Users2 size={13} /> View Referrals
          </Button>
          <Button variant="secondary" onClick={() => window.location.href = "/admin/notifications"}>
            <Bell size={13} /> Push Notifications
          </Button>
        </div>

        {/* Channel performance chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-2">
              <Target size={14} className="text-cyan" /> Acquisition Channel Performance
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={channelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--textDim)" tick={{ fontSize: 11, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                <Tooltip {...TT} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {channelData.map((_, i) => (
                    <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-2">
              <Award size={14} className="text-yellow" /> Top Referrers
            </h2>
            {topReferrers.length === 0 ? (
              <div className="text-center text-textMuted py-8 text-sm">No referral data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topReferrers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                  <YAxis type="category" dataKey="name" width={80} stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                  <Tooltip {...TT} />
                  <Bar dataKey="referrals" radius={[0, 5, 5, 0]}>
                    {topReferrers.map((_: any, i: number) => (
                      <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Promotions table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">All Promotions</h2>
            <Button onClick={() => setCreateModal(true)} variant="secondary"><Plus size={13} /> Create</Button>
          </div>
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Code", "Discount", "Type", "Uses", "Role", "Expires", "Status", ""].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {promos.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-textMuted">No promotions yet</td></tr>
                  ) : promos.map(p => (
                    <tr key={p.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-black text-cyan">{p.code}</td>
                      <td className="py-3 px-4 font-bold text-text tabular-nums">
                        {p.discount_type === "percent" ? `${p.discount_value}%` : formatZAR(p.discount_value)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full border border-cyan/20 bg-cyan/10 text-cyan text-[10px] font-bold">
                          {p.discount_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-textMuted tabular-nums">{p.use_count || 0}{p.max_uses ? ` / ${p.max_uses}` : ""}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full border border-purple/20 bg-purple/10 text-purple text-[10px] font-bold">
                          {p.target_role || "all"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-textDim whitespace-nowrap">{p.expires_at ? formatDate(p.expires_at) : "Never"}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${
                          p.active ? "border-green/20 bg-green/10 text-green" : "border-yellow/20 bg-yellow/10 text-yellow"
                        }`}>
                          {p.active ? "active" : "paused"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1.5">
                          <button onClick={() => handleTogglePromo(p)}
                            className="text-[10px] px-2 py-1 rounded-lg border border-border text-textMuted hover:text-cyan hover:border-cyan/30 font-bold transition-all">
                            {p.active ? "Pause" : "Activate"}
                          </button>
                          <button onClick={() => handleDeletePromo(p.id)}
                            className="text-[10px] px-2 py-1 rounded-lg border border-border text-textMuted hover:text-red hover:border-red/30 font-bold transition-all">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent broadcasts */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">Recent Broadcasts</h2>
            <Button onClick={() => window.location.href = "/admin/notifications"} variant="secondary"><Send size={13} /> Manage Broadcasts</Button>
          </div>
          {broadcasts.length === 0 ? (
            <div className="py-8 text-center border border-border rounded-xl text-textMuted text-sm">No broadcasts yet</div>
          ) : (
            <div className="space-y-2">
              {broadcasts.slice(0, 10).map((b: any) => (
                <div key={b.id} className="bg-bg2 border border-border rounded-xl px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyanDim border border-cyan/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Megaphone size={13} className="text-cyan" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-text text-sm">{b.title}</p>
                      <span className="px-2 py-0.5 rounded-full border border-cyan/20 bg-cyan/10 text-cyan text-[10px] font-bold">
                        {b.target === "role" ? b.target_role || "role" : b.target || "all"}
                      </span>
                    </div>
                    <p className="text-textMuted text-[11px] mt-0.5 line-clamp-1">{b.body || b.message}</p>
                  </div>
                  <div className="text-right text-[10px] text-textDim flex-shrink-0">
                    <p>{b.sent_by_name || "System"}</p>
                    <p>{formatDate(b.sent_at || b.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Create Promotion Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Promotion">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Promo Code</label>
            <Input placeholder="SUMMER20" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Discount Type</label>
              <Select value={promoType} onChange={e => setPromoType(e.target.value)} className="w-full">
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat (R)</option>
              </Select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                Value {promoType === "percent" ? "(%)" : "(ZAR)"}
              </label>
              <Input type="number" placeholder="10" value={promoDiscount} onChange={e => setPromoDiscount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Max Uses</label>
              <Input type="number" placeholder="Unlimited" value={promoMax} onChange={e => setPromoMax(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Target Role</label>
              <Select value={promoRole} onChange={e => setPromoRole(e.target.value)} className="w-full">
                <option value="">All users</option>
                <option value="passenger">Passengers</option>
                <option value="driver">Drivers</option>
                <option value="owner">Owners</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Expiry Date</label>
            <Input type="date" value={promoExpiry} onChange={e => setPromoExpiry(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreatePromo} loading={saving}>
              <Tag size={13} /> Create Promotion
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Promotion Confirmation Modal */}
      <Modal open={!!deletePromoId} onClose={() => setDeletePromoId(null)} title="Delete Promotion">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">This promotion will be permanently deleted. Users with the promo code will no longer be able to redeem it.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeletePromoId(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDeletePromo}><Trash2 size={12} /> Delete Promotion</Button>
          </div>
        </div>
      </Modal>

    </AdminShell>
  );
}
