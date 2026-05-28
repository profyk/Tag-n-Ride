"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Target, Tag, Users2, Send, Megaphone, Star, TrendingUp,
  Gift, MessageCircle, Bell, Plus, Zap, Award,
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
  const [broadcastModal, setBroadcastModal] = useState(false);

  // Promo form
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState("");
  const [promoType, setPromoType] = useState("percent");
  const [promoMax, setPromoMax] = useState("");
  const [promoExpiry, setPromoExpiry] = useState("");
  const [promoRole, setPromoRole] = useState("passenger");
  const [saving, setSaving] = useState(false);

  // Broadcast form
  const [bTitle, setBTitle] = useState("");
  const [bMessage, setBMessage] = useState("");
  const [bTarget, setBTarget] = useState("all");
  const [bRole, setBRole] = useState("");
  const [bSending, setBSending] = useState(false);

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

  const handleSendBroadcast = async () => {
    if (!bTitle.trim() || !bMessage.trim()) { toast.error("Title and message required"); return; }
    setBSending(true);
    try {
      await api.sendBroadcast({ title: bTitle.trim(), message: bMessage.trim(), target: bTarget, target_role: bRole || undefined });
      toast.success("Broadcast sent");
      setBroadcastModal(false);
      setBTitle(""); setBMessage(""); setBTarget("all"); setBRole("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBSending(false); }
  };

  const handleTogglePromo = async (promo: any) => {
    try {
      await api.updatePromotion(promo.id, { active: !promo.active });
      toast.success(promo.active ? "Promotion paused" : "Promotion activated");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeletePromo = async (id: string) => {
    if (!confirm("Delete this promotion?")) return;
    try {
      await api.deletePromotion(id);
      toast.success("Deleted");
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
          <Button variant="secondary" onClick={() => setBroadcastModal(true)}>
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
          <Table headers={["Code", "Discount", "Type", "Uses", "Role", "Expires", "Status", ""]} empty={!promos.length}>
            {promos.map(p => (
              <Tr key={p.id}>
                <Td className="font-mono font-bold text-cyan">{p.code}</Td>
                <Td className="font-bold">
                  {p.discount_type === "percent" ? `${p.discount_value}%` : formatZAR(p.discount_value)}
                </Td>
                <Td><Badge label={p.discount_type} tone="cyan" /></Td>
                <Td className="text-textMuted">{p.use_count || 0}{p.max_uses ? ` / ${p.max_uses}` : ""}</Td>
                <Td><Badge label={p.target_role || "all"} tone="purple" /></Td>
                <Td className="text-textMuted text-xs">{p.expires_at ? formatDate(p.expires_at) : "Never"}</Td>
                <Td><Badge label={p.active ? "active" : "paused"} tone={p.active ? "green" : "yellow"} /></Td>
                <Td>
                  <div className="flex gap-2">
                    <button onClick={() => handleTogglePromo(p)} className="text-xs px-2 py-1 rounded border border-border text-textMuted hover:text-cyan hover:border-cyan/30 transition-all">
                      {p.active ? "Pause" : "Activate"}
                    </button>
                    <button onClick={() => handleDeletePromo(p.id)} className="text-xs px-2 py-1 rounded border border-border text-textMuted hover:text-red hover:border-red/30 transition-all">
                      Delete
                    </button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        </div>

        {/* Recent broadcasts */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">Recent Broadcasts</h2>
            <Button onClick={() => setBroadcastModal(true)} variant="secondary"><Send size={13} /> Send</Button>
          </div>
          <Table headers={["Title", "Message", "Audience", "Sent By", "Date"]} empty={!broadcasts.length}>
            {broadcasts.slice(0, 10).map((b: any) => (
              <Tr key={b.id}>
                <Td className="font-semibold">{b.title}</Td>
                <Td className="text-textMuted text-xs max-w-xs truncate">{b.body || b.message}</Td>
                <Td><Badge label={b.target === "role" ? b.target_role || "role" : b.target || "all"} tone="cyan" /></Td>
                <Td className="text-textMuted text-xs">{b.sent_by_name || "System"}</Td>
                <Td className="text-textMuted text-xs">{formatDate(b.sent_at || b.created_at)}</Td>
              </Tr>
            ))}
          </Table>
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

      {/* Send Broadcast Modal */}
      <Modal open={broadcastModal} onClose={() => setBroadcastModal(false)} title="Send Broadcast">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Title</label>
            <Input placeholder="Announcement title..." value={bTitle} onChange={e => setBTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Message</label>
            <textarea value={bMessage} onChange={e => setBMessage(e.target.value)} placeholder="Message body..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan resize-none h-24" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Audience</label>
              <Select value={bTarget} onChange={e => setBTarget(e.target.value)} className="w-full">
                <option value="all">All Users</option>
                <option value="role">By Role</option>
              </Select>
            </div>
            {bTarget === "role" && (
              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Role</label>
                <Select value={bRole} onChange={e => setBRole(e.target.value)} className="w-full">
                  <option value="">Select...</option>
                  <option value="passenger">Passengers</option>
                  <option value="driver">Drivers</option>
                  <option value="owner">Owners</option>
                </Select>
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setBroadcastModal(false)}>Cancel</Button>
            <Button onClick={handleSendBroadcast} loading={bSending}>
              <Send size={13} /> Send
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
