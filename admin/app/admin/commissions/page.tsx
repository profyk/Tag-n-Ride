"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { CommissionRequest } from "@/lib/api";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";
import { CheckCircle, XCircle, Clock, Play, Save } from "lucide-react";

const STATUS_COLORS: Record<string, "green" | "red" | "yellow" | "gray"> = {
  approved: "green",
  rejected: "red",
  pending: "yellow",
};

export default function CommissionsPage() {
  const [rows, setRows] = useState<CommissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [acting, setActing] = useState<string | null>(null);

  // Auto-cashup time settings
  const [cashupTime, setCashupTime] = useState<string>("");
  const [savedTime, setSavedTime] = useState<string | null>(null);
  const [savingTime, setSavingTime] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const load = (status?: string) => {
    setLoading(true);
    api.commissionRequests(status || undefined)
      .then(r => setRows(r.data))
      .catch(() => toast.error("Failed to load commission requests"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(filter);
    api.getPayoutSettings()
      .then(r => {
        const t = r.data.commission_auto_cashup_time || "";
        setCashupTime(t);
        setSavedTime(t || null);
      })
      .finally(() => setSettingsLoading(false));
  }, [filter]);

  const act = async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await api.reviewCommission(id, action);
      toast.success(`Commission ${action}d`);
      load(filter);
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${action}`);
    } finally {
      setActing(null);
    }
  };

  const saveTime = async () => {
    setSavingTime(true);
    try {
      await api.updatePayoutSettings({ commission_auto_cashup_time: cashupTime || null });
      setSavedTime(cashupTime || null);
      toast.success(cashupTime ? `Auto-cashup set for ${cashupTime} SAST daily` : "Auto-cashup disabled");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingTime(false);
    }
  };

  const runNow = async () => {
    setTriggering(true);
    try {
      const r = await api.triggerCommissionCashup();
      toast.success(r.data.message || "Auto-cashup triggered");
    } catch {
      toast.error("Failed to trigger cashup");
    } finally {
      setTriggering(false);
    }
  };

  const pending = rows.filter(r => r.commission_status === "pending").length;

  return (
    <AdminShell title="Commission Split">
      <div className="space-y-6">

        {/* Auto-cashup settings */}
        <Card className="p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Auto Cashup Schedule</h2>
          <p className="text-sm text-gray-500 mb-4">
            Set a daily time (SAST) when the system automatically runs commission cashup for all approved drivers.
            Cashup is wallet → wallet only. Fuel deductions are applied before splitting.
          </p>
          {settingsLoading ? (
            <Spinner />
          ) : (
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Cashup time (SAST, 24h)
                </label>
                <input
                  type="time"
                  value={cashupTime}
                  onChange={e => setCashupTime(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Button
                onClick={saveTime}
                disabled={savingTime}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {savingTime ? "Saving…" : "Save schedule"}
              </Button>
              {cashupTime && (
                <button
                  onClick={() => { setCashupTime(""); }}
                  className="text-sm text-red-500 hover:underline"
                >
                  Clear (disable)
                </button>
              )}
              <div className="ml-auto">
                <Button
                  onClick={runNow}
                  disabled={triggering}
                  variant="secondary"
                  className="border-green-500 text-green-700 hover:bg-green-50"
                >
                  <Play className="w-4 h-4 mr-1.5" />
                  {triggering ? "Running…" : "Run now"}
                </Button>
              </div>
            </div>
          )}
          {savedTime && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4" />
              Auto-cashup fires daily at <strong>{savedTime}</strong> SAST
            </div>
          )}
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">{pending}</div>
            <div className="text-sm text-gray-500">Pending Approval</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">
              {rows.filter(r => r.commission_status === "approved").length}
            </div>
            <div className="text-sm text-gray-500">Approved</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">
              {rows.filter(r => r.commission_status === "rejected").length}
            </div>
            <div className="text-sm text-gray-500">Rejected</div>
          </Card>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {["pending", "approved", "rejected", ""].map(s => (
            <button
              key={s || "all"}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filter === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <Card>
          {loading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No commission requests found</div>
          ) : (
            <Table headers={["Owner", "Driver", "Driver %", "Owner %", "Status", "Date", "Actions"]}>
              {rows.map(r => (
                <Tr key={r.id}>
                  <Td>
                    <div className="font-medium">{r.owner_name}</div>
                    <div className="text-xs text-gray-400">{r.owner_phone}</div>
                  </Td>
                  <Td>
                    <div className="font-medium">{r.driver_name}</div>
                    <div className="text-xs text-gray-400">{r.driver_phone}</div>
                  </Td>
                  <Td>
                    <span className="font-mono font-bold text-blue-600">
                      {r.driver_commission_pct.toFixed(1)}%
                    </span>
                    <div className="text-xs text-gray-400">driver keeps</div>
                  </Td>
                  <Td>
                    <span className="font-mono font-bold text-purple-600">
                      {(100 - r.driver_commission_pct).toFixed(1)}%
                    </span>
                    <div className="text-xs text-gray-400">owner receives</div>
                  </Td>
                  <Td>
                    <Badge color={STATUS_COLORS[r.commission_status] || "gray"}>
                      {r.commission_status}
                    </Badge>
                  </Td>
                  <Td>{r.commission_approved_at ? formatDate(r.commission_approved_at) : "—"}</Td>
                  <Td>
                    {r.commission_status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => act(r.id, "approve")}
                          disabled={acting === r.id}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => act(r.id, "reject")}
                          disabled={acting === r.id}
                          className="border-red-400 text-red-600 hover:bg-red-50"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                    {r.commission_status !== "pending" && (
                      <span className="text-xs">
                        {r.commission_status === "approved" ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3.5 h-3.5" /> Approved
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500">
                            <XCircle className="w-3.5 h-3.5" /> Rejected
                          </span>
                        )}
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Info box */}
        <Card className="p-4 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-2">How Commission Split Works</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc ml-4">
            <li>Owner proposes a % split per driver (e.g. driver keeps 60%, owner gets 40%)</li>
            <li>Admin approves the proposal here — it then takes effect on next cashup</li>
            <li>Cashup is <strong>wallet → wallet only</strong> (no bank transfers in commission mode)</li>
            <li>At cashup time: today&apos;s fuel is deducted first, then remaining earnings are split</li>
            <li>Auto-cashup fires at the scheduled SAST time for all approved drivers automatically</li>
            <li>Drivers with zero net earnings after fuel are skipped silently</li>
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
