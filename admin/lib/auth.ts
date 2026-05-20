import { getToken, clearToken, getRole } from "./api";

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) { clearToken(); return false; }
    return ["admin", "superadmin", "finance", "support", "ceo", "cto", "cfo"].includes(payload.role);
  } catch { return false; }
}

export function requireAuth() {
  if (typeof window === "undefined") return;
  if (!isAuthenticated()) window.location.href = "/login";
}

export function isSuperAdmin(): boolean {
  return ["superadmin", "ceo"].includes(getRole() || "");
}
