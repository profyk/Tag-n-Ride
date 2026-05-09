import { getToken, clearToken } from "./api";

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) { clearToken(); return false; }
    return payload.role === "admin";
  } catch { return false; }
}

export function requireAdmin() {
  if (typeof window === "undefined") return;
  if (!isAuthenticated()) window.location.href = "/login";
}
