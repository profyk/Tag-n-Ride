"use client";
import { useEffect, useState, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Star, Flag, Trash2, Download, TrendingUp, BarChart3, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { api, FeedbackItem } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const STAR_COLOR = (r: number) => r >= 4 ? "text-green" : r === 3 ? "text-yellow" : "text-red";
const BAR_COLOR = (r: number) => r >= 4 ? "#00E676" : r === 3 ? "#FFD60A" : "#FF3B30";

const StarDisplay = ({ rating }: { rating: number }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((s) => (
      <Star key={s} size={12} className={s <= rating ? STAR_COLOR(rating) : "text-textDim"} fill={s <= rating ? "currentColor" : "none"} />
    ))}
  </div>
);

export default function FeedbackPage() {
  const [data, setData] = useState<{ items: FeedbackItem[]; stats: { total: number; avg_rating: number; flagged_count: number } }>({
    items: [], stats: { total: 0, avg_rating: 0, flagged_count: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [maxStars, setMaxStars] = useState<number | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api.feedback({
      ...(flaggedOnly ? { flagged: true } : {}),
      ...(maxStars !== undefined ? { max_stars: maxStars } : {}),
    }).then((r) => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [flaggedOnly, maxStars]);

  const { items, stats } = data;

  // Rating distribution
  const distribution = useMemo(() => [5, 4, 3, 2, 1].map(star => ({
    star: `${star}★`,
    count: items.filter(i => i.rating === star).length,
    star_num: star,
  })), [items]);

  // Sentiment breakdown
  const positive = items.filter(i => i.rating >= 4).length;
  const neutral  = items.filter(i => i.rating === 3).length;
  const negative = items.filter(i => i.rating <= 2).length;
  const sentimentScore = items.length > 0 ? Math.round((positive / items.length) * 100) : 0;

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    const flaggedIds = items.filter(i => i.is_flagged).map(i => i.id);
    setSelected(prev => flaggedIds.every(id => prev.has(id)) ? new Set() : new Set(flaggedIds));
  };

  const flag = async (item: FeedbackItem) => {
    try {
      if (item.is_flagged) { await api.unflagFeedback(item.id); toast.success("Unflagged"); }
      else { await api.flagFeedback(item.id, "Flagged by admin"); toast.success("Flagged"); }
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (item: FeedbackItem) => {
    if (!confirm("Delete this review permanently?")) return;
    try { await api.deleteFeedback(item.id); toast.success("Review deleted"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Permanently delete ${ids.length} review${ids.length > 1 ? "s" : ""}?`)) return;
    setBulkDeleting(true);
    let done = 0;
    for (const id of ids) {
      try { await api.deleteFeedback(id); done++; } catch {}
    }
    setBulkDeleting(false);
    setSelected(new Set());
    toast.success(`${done}/${ids.length} reviews deleted`);
    load();
  };

  const exportCsv = () => {
    const rows = [
      ["Rating", "Comment", "From", "From Role", "About", "About Role", "Flagged", "Date"],
      ...items.map(i => [
        String(i.rating), i.comment ?? "", i.rater_name, i.rater_role,
        i.rated_name, i.rated_role, i.is_flagged ? "Yes" : "No", formatDate(i.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `feedback_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("Exported");
  };

  return (
    <AdminShell title="Feedback & Ratings">
      <div className="space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Reviews" value={String(stats.total)} tone="cyan" />
          <StatCard label="Average Rating" value={`${stats.avg_rating.toFixed(1)} ★`} tone={stats.avg_rating >= 4 ? "green" : stats.avg_rating >= 3 ? "yellow" : "red"} />
          <StatCard label="Sentiment Score" value={`${sentimentScore}%`} tone={sentimentScore >= 70 ? "green" : sentimentScore >= 50 ? "yellow" : "red"} />
          <StatCard label="Flagged Reviews" value={String(stats.flagged_count)} tone={stats.flagged_count > 0 ? "red" : "green"} />
        </div>

        {/* Sentiment banner */}
        <div className={`flex items-center gap-4 p-4 rounded-xl border ${sentimentScore >= 70 ? "bg-green/5 border-green/20" : sentimentScore >= 50 ? "bg-yellow/5 border-yellow/20" : "bg-red/5 border-red/20"}`}>
          <TrendingUp size={16} className={sentimentScore >= 70 ? "text-green" : sentimentScore >= 50 ? "text-yellow" : "text-red"} />
          <div className="flex gap-6 text-xs">
            <span className="text-green font-bold">😊 Positive: {positive} ({items.length > 0 ? Math.round(positive/items.length*100) : 0}%)</span>
            <span className="text-yellow font-bold">😐 Neutral: {neutral} ({items.length > 0 ? Math.round(neutral/items.length*100) : 0}%)</span>
            <span className="text-red font-bold">😞 Negative: {negative} ({items.length > 0 ? Math.round(negative/items.length*100) : 0}%)</span>
          </div>
        </div>

        {/* Rating distribution */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={15} className="text-cyan" />
            <h2 className="text-text font-bold text-sm">Rating Distribution</h2>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={distribution} layout="vertical" margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "var(--textDim)", fontSize: 10 }} />
              <YAxis type="category" dataKey="star" tick={{ fill: "var(--textMuted)", fontSize: 11 }} width={30} />
              <Tooltip contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Reviews">
                {distribution.map((d, i) => <Cell key={i} fill={BAR_COLOR(d.star_num)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Table */}
        <Card>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-text font-bold">User Feedback</h2>
              {selected.size > 0 && (
                <Button variant="danger" loading={bulkDeleting} onClick={handleBulkDelete}>
                  <Trash2 size={12} /> Delete Selected ({selected.size})
                </Button>
              )}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <select value={maxStars ?? ""} onChange={(e) => setMaxStars(e.target.value ? parseInt(e.target.value) : undefined)}
                className="text-xs bg-bg border border-border rounded-lg px-2 py-1.5 text-textMuted outline-none focus:border-cyan">
                <option value="">All Stars</option>
                <option value="1">1★ only</option>
                <option value="2">≤ 2★</option>
                <option value="3">≤ 3★</option>
              </select>
              <button onClick={() => setFlaggedOnly((f) => !f)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${flaggedOnly ? "bg-red/10 text-red border-red/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                {flaggedOnly ? "Flagged Only" : "All Reviews"}
              </button>
              {stats.flagged_count > 0 && (
                <button onClick={toggleSelectAll}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border bg-bg2 text-textMuted border-border hover:text-text transition-all">
                  Select Flagged
                </button>
              )}
              <Button variant="secondary" onClick={exportCsv}><Download size={13} /> Export</Button>
            </div>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["", "Rating", "Comment", "From", "About", "Flagged", "Date", "Actions"]}
              empty={!items.length}
            >
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-cyan"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </Td>
                  <Td><StarDisplay rating={item.rating} /></Td>
                  <Td className="text-textMuted text-xs max-w-[200px]">{item.comment || <span className="italic text-textDim">No comment</span>}</Td>
                  <Td>
                    <p className="text-sm font-semibold">{item.rater_name}</p>
                    <p className="text-[10px] text-textMuted capitalize">{item.rater_role}</p>
                  </Td>
                  <Td>
                    <p className="text-sm font-semibold">{item.rated_name}</p>
                    <p className="text-[10px] text-textMuted capitalize">{item.rated_role}</p>
                  </Td>
                  <Td>{item.is_flagged ? <Badge label="flagged" tone="red" /> : <span className="text-textDim text-xs">—</span>}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(item.created_at)}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" onClick={() => flag(item)} title={item.is_flagged ? "Unflag" : "Flag"}>
                        <Flag size={13} className={item.is_flagged ? "text-yellow" : "text-textDim"} />
                      </Button>
                      <Button variant="ghost" onClick={() => remove(item)}>
                        <Trash2 size={13} className="text-red" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
