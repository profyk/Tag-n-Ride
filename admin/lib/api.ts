import axios, { AxiosError, AxiosInstance } from "axios";

const BASE_URL = "https://tag-n-ride-production.up.railway.app";
export const TOKEN_KEY = "tnr_admin_token";
export const PERMS_KEY = "tnr_permissions";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PERMS_KEY);
}
export function setPermissions(perms: string[]) {
  localStorage.setItem(PERMS_KEY, JSON.stringify(perms));
}
export function getPermissions(): string[] {
  try { return JSON.parse(localStorage.getItem(PERMS_KEY) || "[]"); } catch { return []; }
}
export function hasPermission(p: string): boolean {
  return getPermissions().includes(p);
}
export function getRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1])).role || null;
  } catch { return null; }
}
export function isSuperAdmin(): boolean {
  return ["superadmin", "ceo"].includes(getRole() || "");
}
export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) { clearToken(); return false; }
    return ["admin", "superadmin", "finance", "support", "ceo", "cto", "cfo"].includes(payload.role);
  } catch { return false; }
}

const client: AxiosInstance = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ detail?: string | { msg: string }[] }>) => {
    if (error.response?.status === 401) {
      clearToken();
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    const detail = error.response?.data?.detail;
    const msg = Array.isArray(detail)
      ? detail.map((d) => (typeof d === "object" ? d.msg : d)).join(", ")
      : typeof detail === "string" ? detail : error.message;
    return Promise.reject(new Error(msg));
  }
);

export default client;

// ── Types ──
export type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  created_by?: string;
  created_by_name?: string;
};

export type User = {
  id: string;
  phone_number: string;
  full_name: string;
  role: string;
  is_active: boolean;
  flagged: boolean;
  created_at: string;
};

export type Driver = {
  user_id: string;
  full_name: string;
  phone_number: string;
  vehicle_plate: string;
  total_earnings: number;
  is_verified: boolean;
  rating_avg: number;
  rating_count: number;
  qr_code: string;
  kyc_status: string;
  created_at: string;
};

export type Transaction = {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  platform_fee?: number;
  driver_net?: number;
  sender_id?: string;
  receiver_id?: string;
  sender_name?: string;
  receiver_name?: string;
  note?: string;
  created_at: string;
};

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name?: string;
  status: string;
  created_at: string;
  user_name?: string;
  phone_number?: string;
  wallet_balance?: number;
  is_frozen?: boolean;
};

export type AuditLog = {
  id: string;
  admin_id?: string;
  admin_name?: string;
  admin_role?: string;
  action: string;
  target_id?: string;
  target_type?: string;
  metadata: Record<string, unknown>;
  ip_address?: string;
  success: boolean;
  created_at: string;
};

export type KYCDocument = {
  id: string;
  user_id: string;
  full_name?: string;
  phone_number?: string;
  selfie_url?: string;
  licence_front_url?: string;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  submitted_at: string;
};

export type Session = {
  id: string;
  admin_id: string;
  full_name: string;
  email: string;
  role: string;
  ip_address?: string;
  created_at: string;
  expires_at: string;
};

export type DashboardStats = {
  total_users: number;
  total_drivers: number;
  total_passengers: number;
  total_transactions: number;
  total_revenue: number;
  total_wallet_balance: number;
  total_withdrawn: number;
  pending_withdrawals: number;
  pending_drivers: number;
  pending_kyc: number;
  flagged_accounts: number;
  today_revenue: number;
  today_transactions: number;
  today_signups: number;
  suspicious_transactions: Transaction[];
  recent_transactions: Transaction[];
  pending_driver_list: {
    user_id: string;
    full_name: string;
    phone_number: string;
    vehicle_plate: string;
    created_at: string;
  }[];
};

// ── API ──
export const api = {
  login: (email: string, password: string) =>
    client.post<{
      token: string;
      user: { id: string; email: string; full_name: string; role: string; permissions: string[] };
    }>("/api/auth/admin-login", { email, password }),

  logout: () => client.post("/api/auth/admin-logout"),

  dashboard: () => client.get<DashboardStats>("/api/admin/dashboard"),

  users: (search?: string) =>
    client.get<User[]>("/api/admin/users", { params: search ? { search } : {} }),
  blockUser: (id: string) => client.post(`/api/admin/block/${id}`),
  unblockUser: (id: string) => client.post(`/api/admin/unblock/${id}`),
  resetPin: (id: string) =>
    client.post<{ ok: boolean; temporary_pin: string }>(`/api/admin/reset-pin/${id}`),
  flagUser: (id: string, reason: string) =>
    client.post(`/api/admin/flag/${id}`, { reason }),
  unflagUser: (id: string) => client.post(`/api/admin/unflag/${id}`),
  deleteUser: (id: string) => client.delete(`/api/superadmin/users/${id}`),

  drivers: () => client.get<Driver[]>("/api/admin/drivers"),
  verifyDriver: (id: string) => client.post(`/api/admin/verify-driver/${id}`),

  transactions: (params?: {
    type?: string;
    from_date?: string;
    to_date?: string;
    search?: string;
    min_amount?: number;
    max_amount?: number;
  }) => client.get<Transaction[]>("/api/admin/transactions", { params }),

  withdrawals: () => client.get<Withdrawal[]>("/api/admin/withdrawals"),
  approveWithdrawal: (id: string) => client.post(`/api/admin/withdraw/${id}/approve`),
  rejectWithdrawal: (id: string) => client.post(`/api/admin/withdraw/${id}/reject`),

  kycList: () => client.get<KYCDocument[]>("/api/admin/kyc"),
  kycDetail: (userId: string) => client.get<KYCDocument>(`/api/admin/kyc/${userId}`),
  kycReview: (userId: string, action: "approve" | "reject", rejection_reason?: string) =>
    client.post(`/api/admin/kyc/${userId}/review`, { action, rejection_reason }),

  analytics: () =>
    client.get<{
      daily_volume: { date: string; amount: number; count: number }[];
      weekly_revenue: { week: string; amount: number }[];
      driver_leaderboard: { name: string; earnings: number }[];
      transactions_by_type: { type: string; count: number; total: number }[];
      top_passengers: { name: string; txn_count: number; total_spent: number }[];
      withdrawal_trend: { date: string; amount: number; count: number }[];
    }>("/api/admin/analytics"),

  auditLogs: () => client.get<AuditLog[]>("/api/admin/audit-logs"),

  supportLookup: (phone: string) =>
    client.get(`/api/admin/support/user/${encodeURIComponent(phone)}`),

  flaggedAccounts: () => client.get("/api/admin/flagged"),

  listAdmins: () => client.get<AdminUser[]>("/api/superadmin/admins"),
  createAdmin: (body: { full_name: string; email: string; password: string; role: string }) =>
    client.post<{ ok: boolean; id: string }>("/api/superadmin/create-admin", body),
  updateAdmin: (id: string, body: { role?: string; full_name?: string; email?: string }) =>
    client.patch(`/api/superadmin/admins/${id}`, body),
  suspendAdmin: (id: string) => client.post(`/api/superadmin/admins/${id}/suspend`),
  reactivateAdmin: (id: string) => client.post(`/api/superadmin/admins/${id}/reactivate`),
  deleteAdmin: (id: string) => client.delete(`/api/superadmin/admins/${id}`),
  forceLogout: (id: string) => client.post(`/api/superadmin/admins/${id}/force-logout`),
  resetAdminPassword: (id: string, new_password: string) =>
    client.post(`/api/superadmin/admins/${id}/reset-password`, { new_password }),

  sessions: () => client.get<Session[]>("/api/superadmin/sessions"),
  revokeSession: (id: string) => client.post(`/api/superadmin/sessions/${id}/revoke`),

  getUserWallet: (id: string) => client.get(`/api/superadmin/wallet/${id}`),
  freezeWallet: (id: string, reason: string) =>
    client.post(`/api/superadmin/freeze-wallet/${id}`, { reason }),
  unfreezeWallet: (id: string) => client.post(`/api/superadmin/unfreeze-wallet/${id}`),
  transferFunds: (body: {
    from_user_id: string;
    to_user_id: string;
    amount: number;
    note?: string;
  }) =>
    client.post<{ ok: boolean; reference: string }>("/api/superadmin/transfer-funds", body),
  adjustBalance: (body: { user_id: string; amount: number; note?: string }) =>
    client.post<{ ok: boolean; new_balance: number }>("/api/superadmin/adjust-balance", body),

  exportTransactions: () =>
    window.open(`${BASE_URL}/api/admin/export/transactions`, "_blank"),
  exportUsers: () =>
    window.open(`${BASE_URL}/api/admin/export/users`, "_blank"),
};
