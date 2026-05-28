export function formatZAR(amount: number): string {
  return `R ${amount.toLocaleString("en-ZA", {
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
