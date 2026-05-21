"use client";
import { useState, useEffect } from "react";
import { api, setToken, setPermissions } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";

const ALLOWED_ROLES = ["admin", "superadmin", "finance", "support", "ceo", "cto", "cfo"];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) router.push("/admin/dashboard");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login(email, password);
      const { token, user } = res.data;

      if (!ALLOWED_ROLES.includes(user.role)) {
        toast.error("Access denied — admin only");
        return;
      }

      setToken(token);
      setPermissions(user.permissions || []);
      toast.success(`Welcome back, ${user.full_name}`);
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

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-cyanDim border border-cyan/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-cyan font-black text-2xl">TR</span>
          </div>
          <h1 className="text-text font-bold text-2xl">Tag n Ride</h1>
          <p className="text-textMuted text-sm mt-1">Admin Dashboard</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-bg2 border border-border rounded-xl p-6 space-y-4">

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@tagnride.app"
              required
              className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 pr-10 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-text transition-colors">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan text-bg font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-cyan/90 transition-colors disabled:opacity-60 mt-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="text-center text-textDim text-xs mt-6">
          Tag n Ride · Admin Portal · Restricted Access
        </p>
      </div>
    </div>
  );
}
