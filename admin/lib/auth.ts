import { getToken, clearToken } from "./api";

const ALLOWED_ROLES = ["admin", "superadmin", "finance", "support", "ceo", "cto", "cfo", "hr"] as const;

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) { clearToken(); return false; }
    return (ALLOWED_ROLES as readonly string[]).includes(payload.role);
  } catch { return false; }
}
