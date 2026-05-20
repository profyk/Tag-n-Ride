"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Badge, Input, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { Search, Key, Snowflake } from "lucide-react";
import toast from "react-hot-toast";

export default function SupportPage() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pinModal, setPinModal] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const res = await api.supportLookup(phone.trim());
      setResult(res.data);
    } catch (e: any) {
      toast.error(e.message || "User not found");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (!result?.user?.id) return;
    try {
      const res = await api.resetPin(result.user.id);
      setPinModal(res.data.temporary_pin);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <AdminShell title="Support Lookup">
      <div className="space-y-6 max-w-2xl">

        {/* Search */}
        <div className="flex gap-3">
          <Input
            placeholder="Enter phone number e.g. +27821234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch}>
            <Search size={13} /> Look up
          </Button>
        </div>

        {loading && <Spinner />}

        {result && (
          <div className="space-y-4">

            {/* User info */}
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-text font-bold text-lg">{result.user.full_name}</p>
                  <p className="text-textMuted text-sm font-mono">{result.user.phone_number}</p>
                  <p className="text-textMuted text-xs mt-1">
                    Joined {formatDate(result.user.created_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge label={result.user.role} tone="cyan" />
                  <Badge
                    label={result.user.is_active ? "Active" : "Blocked"}
                    tone={result.user.is_active ? "green" : "red"}
                  />
                </div>
              </div>
              <Button variant="secondary" onClick={handleResetPin}>
                <Key size={13} /> Reset PIN
              </Button>
            </Card>

            {/* Wallet */}
            <Card>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">
                Wallet
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-extrabold text-cyan">
                    {formatZAR(result.wallet.balance)}
                  </p>
                  <p className="text-textMuted text-xs mt-1">Available balance</p>
                </div>
                {result.wallet.is_frozen ? (
                  <div className="flex items-center gap-2 bg-red/10 border border-red/20 rounded-lg px-3 py-2">
                    <Snowflake size={14} className="text-red" />
                    <span className="text-red text-xs font-bold">FROZEN</span>
                  </div>
                ) : (
                  <Badge label="Active" tone="green" />
                )}
              </div>
            </Card>

            {/* Recent transactions */}
            {result.recent_transactions?.length > 0 && (
              <Card>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">
                  Recent Transactions
                </p>
                <div className="space-y-2">
                  {result.recent_transactions.map((t: any) => (
                    <div key={t.reference}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <span className="font-mono text-xs text-textMuted">{t.reference}</span>
                        <span className="ml-2">
                          <Badge
                            label={t.type}
                            tone={t.type === "topup" ? "cyan" : t.type === "payment" ? "green" : "purple"}
                          />
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-text text-sm">{formatZAR(t.amount)}</p>
                        <p className="text-textMuted text-xs">{formatDate(t.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* PIN Modal */}
      <Modal open={!!pinModal} onClose={() => setPinModal(null)} title="Temporary PIN">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Share this temporary PIN with the user. They should change it immediately after signing in.
          </p>
          <div className="bg-bg border border-border rounded-lg p-4 text-center">
            <span className="text-cyan font-mono text-4xl font-black tracking-widest">
              {pinModal}
            </span>
          </div>
          <p className="text-xs text-red text-center font-semibold">
            Shown once only. Do not share over unsecured channels.
          </p>
          <Button className="w-full justify-center" onClick={() => setPinModal(null)}>
            Done
          </Button>
        </div>
      </Modal>
    </AdminShell>
  );
}
