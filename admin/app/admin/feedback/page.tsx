"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Star, Flag, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { api, FeedbackItem } from "@/lib/api";

const STAR_COLOR = (r: number) => r >= 4 ? "text-green" : r === 3 ? "text-yellow" : "text-red";

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
  const [minStars, setMinStars] = useState<number | undefined>();
  const [maxStars, setMaxStars] = useState<number | undefined>();

  const load = () => {
    setLoading(true);
    api.feedback({
      ...(flaggedOnly ? { flagged: true } : {}),
      ...(minStars !== undefined ? { min_stars: minStars } : {}),
      ...(maxStars !== undefined ? { max_stars: maxStars } : {}),
    }).then((r) => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [flaggedOnly, minStars, maxStars]);

  const flag = async (item: FeedbackItem) => {
    if (item.is_flagged) {
      try { await api.unflagFeedback(item.id); toast.success("Unflagged"); load(); } catch (e: any) { toast.error(e.message); }
    } else {
      try { await api.flagFeedback(item.id, "Flagged by admin"); toast.success("Flagged"); load(); } catch (e: any) { toast.error(e.message); }
    }
  };

  const remove = async (item: FeedbackItem) => {
    if (!confirm("Delete this review permanently?")) return;
    try { await api.deleteFeedback(item.id); toast.success("Review deleted"); load(); } catch (e: any) { toast.error(e.message); }
  };

  const { items, stats } = data;

  return (
    <AdminShell title="Feedback & Ratings">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Reviews" value={String(stats.total)} />
          <StatCard label="Average Rating" value={`${stats.avg_rating.toFixed(1)} ★`} />
          <StatCard label="Flagged Reviews" value={String(stats.flagged_count)} />
          <StatCard label="Low Ratings (1–2★)" value={String(items.filter((i) => i.rating <= 2).length)} />
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text font-bold">User Feedback</h2>
            <div className="flex gap-3 items-center flex-wrap">
              <select value={maxStars ?? ""} onChange={(e) => setMaxStars(e.target.value ? parseInt(e.target.value) : undefined)}
                className="text-xs bg-bg3 border border-border rounded-lg px-2 py-1.5 text-textMuted outline-none focus:border-cyan">
                <option value="">All Stars</option>
                <option value="1">1★ only</option>
                <option value="2">≤ 2★</option>
                <option value="3">≤ 3★</option>
              </select>
              <button onClick={() => setFlaggedOnly((f) => !f)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${flaggedOnly ? "bg-red/10 text-red border-red/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                {flaggedOnly ? "Flagged Only" : "All Reviews"}
              </button>
            </div>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["Rating", "Comment", "From", "About", "Flagged", "Date", "Actions"]}
              empty={!items.length}
            >
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td><StarDisplay rating={item.rating} /></Td>
                  <Td className="text-textMuted text-xs max-w-[200px]">{item.comment || <span className="italic">No comment</span>}</Td>
                  <Td>
                    <p className="text-sm">{item.rater_name}</p>
                    <p className="text-[10px] text-textMuted capitalize">{item.rater_role}</p>
                  </Td>
                  <Td>
                    <p className="text-sm">{item.rated_name}</p>
                    <p className="text-[10px] text-textMuted capitalize">{item.rated_role}</p>
                  </Td>
                  <Td>
                    {item.is_flagged
                      ? <Badge label="flagged" tone="red" />
                      : <span className="text-textDim text-xs">—</span>}
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(item.created_at)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
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
