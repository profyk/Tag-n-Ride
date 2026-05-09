"use client";
import { useState, useEffect } from "react";
import { api, setToken } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (isAuthenticated()) router.push("/admin/dashboard"); }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login(phone, pin);
      if (res.data.user.role !== "admin") {
        toast.error("Access denied — admin only");
        return;
      }
      setToken(res.data.token);
      toast.success("Welcome back");
      router.push("/admin/dashboard");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-cyanDim border border-cyan/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-cyan font-mono font-bold text-2xl">T</span>
          </div>
          <h1 className="text-text font-bold text-2xl">Tag n Ride</h1>
          <p className="text-textMuted text-sm mt-1">Admin Dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-bg2 border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Phone Number</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+27 800 000 000" required autoComplete="tel"
              className="w-full bg-bg border border-border rounded-md px-3 py-2.5 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)}
              placeholder="••••" maxLength={4} required autoComplete="current-password"
              className="w-full bg-bg border border-border rounded-md px-3 py-2.5 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors tracking-widest" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-cyan text-bg font-bold py-2.5 rounded-md text-sm flex items-center justify-center gap-2 hover:bg-cyan/90 transition-colors disabled:opacity-60 mt-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            Sign in
          </button>
        </form>
        <p className="text-center text-textDim text-xs mt-6">Tag n Ride · Admin Portal · Restricted Access</p>
      </div>
    </div>
  );
}
