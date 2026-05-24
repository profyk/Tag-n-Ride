"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Shield, X, AlertTriangle, Eye, EyeOff, CheckCircle } from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

let dangerTokenCache: { token: string; expires: number } | null = null;

export function getDangerToken(): string | null {
  if (!dangerTokenCache) return null;
  if (Date.now() > dangerTokenCache.expires) { dangerTokenCache = null; return null; }
  return dangerTokenCache.token;
}

export function clearDangerToken() { dangerTokenCache = null; }

export function useDangerPin() {
  const [open, setOpen] = useState(false);
  const [resolve, setResolve] = useState<((token: string | null) => void) | null>(null);

  const request = useCallback((): Promise<string | null> => {
    const cached = getDangerToken();
    if (cached) return Promise.resolve(cached);
    return new Promise((res) => {
      setResolve(() => res);
      setOpen(true);
    });
  }, []);

  const handleSuccess = useCallback((token: string) => {
    dangerTokenCache = { token, expires: Date.now() + 4.5 * 60 * 1000 };
    setOpen(false);
    resolve?.(token);
    setResolve(null);
  }, [resolve]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolve?.(null);
    setResolve(null);
  }, [resolve]);

  return { open, request, handleSuccess, handleCancel };
}

function PinDots({ length, filled, error }: { length: number; filled: number; error: boolean }) {
  return (
    <div className="flex gap-3 justify-center my-6">
      {Array.from({ length }).map((_, i) => (
        <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${
          i < filled
            ? error ? "bg-red scale-110" : "bg-cyan scale-110"
            : "bg-bg3 border border-border"
        }`} />
      ))}
    </div>
  );
}interface DangerPinModalProps {
  open: boolean;
  onSuccess: (token: string) => void;
  onCancel: () => void;
  actionLabel?: string;
}

export function DangerPinModal({ open, onSuccess, onCancel, actionLabel }: DangerPinModalProps) {
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const PIN_LENGTH = 10;

  useEffect(() => {
    if (open) {
      setPin(""); setError(""); setSuccess(false); setAttempts(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (pin.length < 4) { setError("PIN too short"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BASE}/api/admin/danger-pin/verify`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Incorrect PIN");
      setSuccess(true);
      setTimeout(() => onSuccess(data.danger_token), 600);
    } catch (e: any) {
      setAttempts(a => a + 1);
      setError(e.message || "Incorrect PIN");
      setPin("");
      inputRef.current?.focus();
      setTimeout(() => setError(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && pin.length >= 4) handleSubmit();
    if (e.key === "Escape") onCancel();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className={`relative bg-bg2 border rounded-2xl w-full max-w-sm shadow-2xl transition-all duration-300 ${
        error ? "border-red/40" : success ? "border-green/40" : "border-border"
      }`}>
        <button onClick={onCancel}
          className="absolute top-4 right-4 text-textDim hover:text-text transition-colors">
          <X size={16} />
        </button>
        <div className="p-8">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-all duration-300 ${
            success ? "bg-green/10 border border-green/20" : "bg-red/10 border border-red/20"
          }`}>
            {success
              ? <CheckCircle size={28} className="text-green" />
              : <Shield size={28} className="text-red" />}
          </div>
          <h2 className="text-text font-extrabold text-xl text-center mb-1">
            {success ? "Authorized" : "Security Verification"}
          </h2>
          <p className="text-textMuted text-sm text-center mb-1">
            {success
              ? "Access granted. Proceeding..."
              : actionLabel
                ? `Enter your danger PIN to ${actionLabel}`
                : "Enter your danger PIN to continue"}
          </p>
          {!success && (
            <p className="text-textDim text-xs text-center">
              Valid for 5 minutes after verification
            </p>
          )}
          <PinDots length={PIN_LENGTH} filled={pin.length} error={!!error} />
          <div className="relative">
            <input
              ref={inputRef}
              type={show ? "text" : "password"}
              value={pin}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
                setPin(v); setError("");
              }}
              onKeyDown={handleKeyDown}
              className={`w-full bg-bg border rounded-xl px-4 py-3.5 text-center text-2xl font-black tracking-[0.5em] text-text focus:outline-none transition-all ${
                error ? "border-red/50 focus:border-red"
                  : success ? "border-green/50"
                  : "border-border focus:border-cyan"
              }`}
              placeholder="••••••••••"
              maxLength={PIN_LENGTH}
              inputMode="numeric"
              autoComplete="off"
              disabled={loading || success}
            />
            <button onClick={() => setShow(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-textDim hover:text-textMuted transition-colors">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 mt-3 p-2.5 bg-red/10 border border-red/20 rounded-lg">
              <AlertTriangle size={13} className="text-red flex-shrink-0" />
              <p className="text-red text-xs font-medium">{error}</p>
            </div>
          )}
          {attempts >= 2 && !error && (
            <p className="text-yellow text-xs text-center mt-2">
              {attempts} failed attempts. Contact your system administrator if locked out.
            </p>
          )}
          <div className="flex gap-3 mt-5">
            <button onClick={onCancel} disabled={loading || success}
              className="flex-1 py-3 bg-bg3 border border-border rounded-xl text-textMuted text-sm font-bold hover:text-text transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={pin.length < 4 || loading || success}
              className="flex-1 py-3 bg-red text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : success ? <CheckCircle size={15} /> : <Shield size={15} />}
              {loading ? "Verifying..." : success ? "Authorized" : "Verify PIN"}
            </button>
          </div>
        </div>
        <div className="px-8 pb-6">
          <p className="text-textDim text-[10px] text-center leading-relaxed">
            This PIN can be changed in Settings by CEO or Superadmin.
            All verification attempts are logged.
          </p>
        </div>
      </div>
    </div>
  );
  }interface ChangePinModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePinModal({ open, onClose }: ChangePinModalProps) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
      setError(""); setSuccess(false);
    }
  }, [open]);

  const handleChange = async () => {
    if (newPin.length < 6) { setError("New PIN must be at least 6 digits"); return; }
    if (newPin !== confirmPin) { setError("New PINs do not match"); return; }
    if (!/^\d+$/.test(newPin)) { setError("PIN must be numeric only"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BASE}/api/admin/danger-pin/change`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to change PIN");
      setSuccess(true);
      clearDangerToken();
      setTimeout(() => onClose(), 2000);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg2 border border-border rounded-2xl w-full max-w-sm shadow-2xl p-8">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-textDim hover:text-text transition-colors">
          <X size={16} />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-purple/10 border border-purple/20 flex items-center justify-center mx-auto mb-5">
          <Shield size={24} className="text-purple" />
        </div>
        <h2 className="text-text font-extrabold text-xl text-center mb-1">Change Danger PIN</h2>
        <p className="text-textMuted text-sm text-center mb-6">CEO and Superadmin only</p>
        {success ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle size={40} className="text-green" />
            <p className="text-green font-bold">PIN changed successfully</p>
          </div>
        ) : (
          <div className="space-y-4">
            {[
              { label: "CURRENT PIN", value: currentPin, set: setCurrentPin, placeholder: "Enter current PIN" },
              { label: "NEW PIN (min 6 digits)", value: newPin, set: setNewPin, placeholder: "Enter new PIN" },
              { label: "CONFIRM NEW PIN", value: confirmPin, set: setConfirmPin, placeholder: "Repeat new PIN" },
            ].map(f => (
              <div key={f.label}>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">
                  {f.label}
                </label>
                <input
                  type="password"
                  value={f.value}
                  onChange={e => { f.set(e.target.value.replace(/\D/g, "")); setError(""); }}
                  placeholder={f.placeholder}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-text text-center text-lg font-black tracking-widest focus:outline-none focus:border-purple"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            ))}
            {error && (
              <div className="flex items-center gap-2 p-2.5 bg-red/10 border border-red/20 rounded-lg">
                <AlertTriangle size={13} className="text-red" />
                <p className="text-red text-xs font-medium">{error}</p>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose}
                className="flex-1 py-3 bg-bg3 border border-border rounded-xl text-textMuted text-sm font-bold hover:text-text transition-colors">
                Cancel
              </button>
              <button onClick={handleChange}
                disabled={loading || !currentPin || !newPin || !confirmPin}
                className="flex-1 py-3 bg-purple text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-purple/90 transition-colors">
                {loading ? "Saving..." : "Change PIN"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
