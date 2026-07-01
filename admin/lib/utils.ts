// ── SA Tax helpers (shared across HR, Payroll, Documents) ─────────────────────
export function calcAnnualPAYE(annualGross: number): number {
  let tax = 0;
  if      (annualGross <= 237_100)   tax = annualGross * 0.18;
  else if (annualGross <= 370_500)   tax = 42_678  + (annualGross - 237_100) * 0.26;
  else if (annualGross <= 512_800)   tax = 77_362  + (annualGross - 370_500) * 0.31;
  else if (annualGross <= 673_000)   tax = 121_475 + (annualGross - 512_800) * 0.36;
  else if (annualGross <= 857_900)   tax = 179_147 + (annualGross - 673_000) * 0.39;
  else if (annualGross <= 1_817_000) tax = 251_258 + (annualGross - 857_900) * 0.41;
  else                               tax = 644_489 + (annualGross - 1_817_000) * 0.45;
  return Math.max(0, tax - 17_235);
}
export const monthlyPAYE = (monthly: number) => calcAnnualPAYE(monthly * 12) / 12;
export const monthlyUIF  = (monthly: number) => Math.min(monthly * 0.01, 177.12);
export const monthlySDL  = (monthly: number) => monthly * 0.01;

export const SA_BANKS: string[] = ["ABSA", "FNB", "Nedbank", "Standard Bank", "Capitec", "Discovery Bank", "Investec", "TymeBank", "African Bank"];
export const SA_BRANCH: Record<string, string> = { ABSA: "632005", FNB: "250655", Nedbank: "198765", "Standard Bank": "051001", Capitec: "470010" };

export const SA_PROVINCES = [
  "Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape",
  "Limpopo", "Mpumalanga", "North West", "Free State", "Northern Cape",
] as const;

export function formatZAR(amount: number | string | undefined | null): string {
  const v = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (!isFinite(v) || isNaN(v)) return "R 0.00";
  return `R ${v.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function timeAgo(iso: string | undefined | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function roleBadgeColor(role: string): string {
  const map: Record<string, string> = {
    superadmin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    ceo: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    cto: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    cfo: "bg-green-500/20 text-green-400 border-green-500/30",
    admin: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    finance: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    support: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    driver: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    passenger: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    owner: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  };
  return map[role] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
}

export function actionColor(action: string): string {
  if (
    action.includes("DELETE") || action.includes("BLOCK") ||
    action.includes("REJECT") || action.includes("SUSPEND")
  ) return "text-red-400";
  if (
    action.includes("CREATE") || action.includes("APPROVE") ||
    action.includes("VERIFY") || action.includes("UNBLOCK")
  ) return "text-green-400";
  if (action.includes("LOGIN")) return "text-cyan-400";
  if (action.includes("FREEZE") || action.includes("FLAG")) return "text-yellow-400";
  return "text-gray-400";
}
