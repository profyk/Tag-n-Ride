import axios, { AxiosError, AxiosInstance } from "axios";

const BASE_URL = "https://tag-n-ride-production.up.railway.app";

export const TOKEN_KEY = "tnr_admin_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

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
      : typeof detail === "string"
      ? detail
      : error.message;

    return Promise.reject(new Error(msg));
  }
);

export default client;

// ── Types ──
export type User = {
  id: string;
  phone_number: string;
  full_name: string;
  role: "passenger" | "driver" | "admin";
  is_active: boolean;
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
  created_at: string;
};

export type Transaction = {
  id: string;
  reference: string;
  type: "topup" | "payment" | "withdrawal";
  status: "completed" | "pending" | "failed";
  amount: number;
  currency: string;
  sender_id: string | null;
  receiver_id: string | null;
  note?: string;
  created_at: string;
  sender_name?: string;
  receiver_name?: string;
};

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name?: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  user_name?: string;
};

export type PayoutAccount = {
  id: string;
  user_id: string;
  driver_name?: string;
  type: "self" | "owner";
  bank_name: string;
  account_number: string;
  account_name?: string;
  created_at: string;
};

export type DashboardStats = {
  total_users: number;
  total_drivers: number;
  total_transactions: number;
  total_revenue: number;
  recent_transactions: Transaction[];
};

// ── API ──
export const api = {
  // Admin
  login: (email: string, password: string) =>
    client.post<{ token: string; user: User }>("/api/auth/admin-login", { email, password }),

  dashboard: () => client.get<DashboardStats>("/api/admin/dashboard"),

  users: (search?: string) =>
    client.get<User[]>("/api/admin/users", { params: search ? { search } : {} }),

  blockUser: (id: string) => client.post(`/api/admin/block/${id}`),
  unblockUser: (id: string) => client.post(`/api/admin/unblock/${id}`),
  resetPin: (id: string) => client.post(`/api/admin/reset-pin/${id}`),

  drivers: () => client.get<Driver[]>("/api/admin/drivers"),
  verifyDriver: (id: string) => client.post(`/api/admin/verify-driver/${id}`),
  driverDetail: (id: string) => client.get<Driver>(`/api/admin/drivers/${id}`),

  transactions: (params?: { type?: string; from?: string; to?: string }) =>
    client.get<Transaction[]>("/api/admin/transactions", { params }),

  withdrawals: () => client.get<Withdrawal[]>("/api/admin/withdrawals"),
  approveWithdrawal: (id: string) => client.post(`/api/admin/withdraw/${id}/approve`),
  rejectWithdrawal: (id: string) => client.post(`/api/admin/withdraw/${id}/reject`),

  payoutAccounts: () => client.get<PayoutAccount[]>("/api/admin/payout-accounts"),

  analytics: () =>
    client.get<{
      daily_volume: { date: string; amount: number; count: number }[];
      driver_leaderboard: { name: string; earnings: number }[];
    }>("/api/admin/analytics"),

  // ── Superadmin ──
  listAdmins: () =>
    client.get<
      {
        id: string;
        full_name: string;
        email: string;
        role: string;
        is_active: boolean;
        created_at: string;
      }[]
    >("/api/superadmin/admins"),

  createAdmin: (body: { full_name: string; email: string; password: string }) =>
    client.post<{ ok: boolean; id: string }>("/api/superadmin/create-admin", body),

  deleteAdmin: (id: string) => client.delete(`/api/superadmin/admins/${id}`),
  deleteUser: (id: string) => client.delete(`/api/superadmin/users/${id}`),

  freezeWallet: (id: string) => client.post(`/api/superadmin/freeze-wallet/${id}`),
  unfreezeWallet: (id: string) => client.post(`/api/superadmin/unfreeze-wallet/${id}`),

  transferFunds: (body: {
    from_user_id: string;
    to_user_id: string;
    amount: number;
    note?: string;
  }) =>
    client.post<{ ok: boolean; reference: string }>(
      "/api/superadmin/transfer-funds",
      body
    ),

  adjustBalance: (body: { user_id: string; amount: number; note?: string }) =>
    client.post<{ ok: boolean; new_balance: number }>(
      "/api/superadmin/adjust-balance",
      body
    ),

  getUserWallet: (id: string) =>
    client.get<{
      user: { id: string; full_name: string; phone_number: string; role: string };
      wallet: { balance: number; is_frozen: boolean; currency: string; created_at: string };
    }>(`/api/superadmin/wallet/${id}`),
};
