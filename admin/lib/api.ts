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
    return ["admin", "superadmin", "finance", "support", "ceo", "cto", "cfo", "hr"].includes(payload.role);
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
  extra_roles?: string[];
  permissions?: string[];
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
  licence_back_url?: string;
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

export type WalletEntry = {
  user_id: string;
  full_name: string;
  phone_number: string;
  role: string;
  is_active: boolean;
  balance: number;
  is_frozen: boolean;
  freeze_reason?: string;
  updated_at: string;
};

export type RefundRequest = {
  id: string;
  user_id: string;
  user_name: string;
  phone_number: string;
  transaction_id: string;
  txn_ref?: string;
  txn_type?: string;
  amount: number;
  reason: string;
  status: string;
  resolution_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
};

export type FeatureFlag = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  rollout_pct: number;
  target_roles?: string[];
  metadata?: Record<string, unknown>;
  updated_by?: string;
  updated_at: string;
  created_at: string;
};

export type PricingRule = {
  id: string;
  zone_id?: string;
  zone_name?: string;
  vehicle_type: string;
  base_fare: number;
  per_km: number;
  per_minute: number;
  min_fare: number;
  surge_multiplier: number;
  surge_active: boolean;
  updated_at: string;
};

export type Promotion = {
  id: string;
  code: string;
  description?: string;
  discount_type: string;
  discount_value: number;
  min_ride_amount?: number;
  max_uses?: number;
  uses_per_user?: number;
  total_used: number;
  active?: boolean;
  valid_from?: string;
  valid_to?: string;
  expires_at?: string;
  target_role?: string;
  created_at: string;
};

export type GDPRRequest = {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string;
  email?: string;
  request_type: string;
  status: string;
  resolution_note?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
};

export type CoverageZone = {
  id: string;
  name: string;
  city?: string;
  province?: string;
  country: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  active: boolean;
  driver_count: number;
  created_at: string;
};

export type Chargeback = {
  id: string;
  user_id: string;
  user_name: string;
  phone_number: string;
  transaction_id?: string;
  txn_ref?: string;
  txn_amount: number;
  amount: number;
  reason: string;
  status: string;
  resolution_note?: string;
  amount_recovered: number;
  created_at: string;
  updated_at: string;
};

export type TxLimit = {
  id: string;
  role: string;
  daily_limit: number;
  single_txn_limit: number;
  monthly_limit: number;
  min_topup: number;
  max_topup: number;
  max_withdrawal: number;
  min_withdrawal: number;
  enabled: boolean;
  updated_at: string;
};

export type Referral = {
  id: string;
  referrer_id: string;
  referrer_name: string;
  referrer_phone: string;
  invitee_id: string;
  invitee_name: string;
  invitee_phone: string;
  status: string;
  reward_amount: number;
  created_at: string;
};

export type FeedbackItem = {
  id: string;
  rating: number;
  comment?: string;
  is_flagged: boolean;
  flag_reason?: string;
  rater_name: string;
  rater_role: string;
  rated_name: string;
  rated_role: string;
  created_at: string;
};

export type Broadcast = {
  id: string;
  title: string;
  body: string;
  target: string;
  target_role?: string;
  sent_by?: string;
  sent_by_name?: string;
  sent_at: string;
};

export type RiskUser = {
  user_id: string;
  full_name: string;
  phone_number: string;
  role: string;
  is_active: boolean;
  flagged: boolean;
  flag_reason?: string;
  balance: number;
  is_frozen: boolean;
  txn_count: number;
  failed_txns: number;
  txns_24h: number;
  volume_24h: number;
  dispute_count: number;
  risk_score: number;
  created_at: string;
};

export type ReconBatch = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_topups: number;
  total_payments: number;
  total_fees: number;
  total_withdrawals: number;
  total_wallets: number;
  variance: number;
  discrepancy_count: number;
  run_by?: string;
  run_by_name?: string;
  created_at: string;
};

export type ReconDiscrepancy = {
  id: string;
  batch_id: string;
  type: string;
  description: string;
  amount: number;
  expected: number;
  actual: number;
  resolved: boolean;
  resolution_note?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
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
  yesterday_revenue: number;
  yesterday_transactions: number;
  yesterday_signups: number;
  total_owners?: number;
  active_drivers?: number;
  verified_drivers?: number;
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

// ── Auth-gated file download (CSV/PDF) ──
export async function downloadAuthFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// ── API ──
export const api = {
  login: (email: string, password: string) =>
    client.post<{
      token: string;
      user: { id: string; email: string; full_name: string; role: string; extra_roles: string[]; permissions: string[] };
    }>("/api/auth/admin-login", { email, password }),

  logout: () => client.post("/api/auth/admin-logout"),

  dashboard: () => client.get<DashboardStats>("/api/admin/dashboard"),

  users: (search?: string) =>
    client.get<User[]>("/api/admin/users", { params: search ? { search } : {} }),
  blockUser: (id: string, reason?: string) => client.post(`/api/admin/block/${id}`, { reason: reason || null }),
  unblockUser: (id: string) => client.post(`/api/admin/unblock/${id}`),
  resetPin: (id: string) =>
    client.post<{ ok: boolean; temporary_pin: string }>(`/api/admin/reset-pin/${id}`),
  flagUser: (id: string, reason: string) =>
    client.post(`/api/admin/flag/${id}`, { reason }),
  unflagUser: (id: string) => client.post(`/api/admin/unflag/${id}`),
  deleteUser: (id: string, token?: string | null) =>
    client.delete(`/api/superadmin/users/${id}`, token ? { headers: { "X-Danger-Token": token } } : undefined),

  drivers: () => client.get<Driver[]>("/api/admin/drivers"),
  driver: (id: string) => client.get<Driver>(`/api/admin/drivers/${id}`),
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
  deleteKycDocuments: (userId: string) =>
    client.delete(`/api/admin/kyc/${userId}/documents`),
  generateDriverQR: (userId: string) =>
    client.post<{ qr_code: string }>(`/api/admin/drivers/${userId}/generate-qr`),

  analytics: (range: "7d" | "30d" | "90d" = "30d") =>
    client.get<{
      daily_volume: { date: string; amount: number; count: number }[];
      weekly_revenue: { week: string; amount: number }[];
      driver_leaderboard: { name: string; earnings: number }[];
      transactions_by_type: { type: string; count: number; total: number }[];
      top_passengers: { name: string; txn_count: number; total_spent: number }[];
      withdrawal_trend: { date: string; amount: number; count: number }[];
      prev_volume?: number;
      prev_count?: number;
    }>(`/api/admin/analytics?range=${range}`),

  auditLogs: () => client.get<AuditLog[]>("/api/admin/audit-logs"),

  supportLookup: (phone: string) =>
    client.get(`/api/admin/support/user/${encodeURIComponent(phone)}`),

  flaggedAccounts: () => client.get("/api/admin/flagged"),

  listAdmins: () => client.get<AdminUser[]>("/api/superadmin/admins"),
  createAdmin: (body: { full_name: string; email: string; password: string; role: string }) =>
    client.post<{ ok: boolean; id: string }>("/api/superadmin/create-admin", body),
  updateAdmin: (id: string, body: { role?: string; extra_roles?: string[]; full_name?: string; email?: string }) =>
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
  freezeWallet: (id: string, reason: string, token?: string | null) =>
    client.post(`/api/superadmin/freeze-wallet/${id}`, { reason }, token ? { headers: { "X-Danger-Token": token } } : undefined),
  unfreezeWallet: (id: string, token?: string | null) =>
    client.post(`/api/superadmin/unfreeze-wallet/${id}`, undefined, token ? { headers: { "X-Danger-Token": token } } : undefined),
  transferFunds: (body: {
    from_user_id: string;
    to_user_id: string;
    amount: number;
    note?: string;
  }, token?: string | null) =>
    client.post<{ ok: boolean; reference: string }>("/api/superadmin/transfer-funds", body, token ? { headers: { "X-Danger-Token": token } } : undefined),
  adjustBalance: (body: { user_id: string; amount: number; note?: string }, token?: string | null) =>
    client.post<{ ok: boolean; new_balance: number }>("/api/superadmin/adjust-balance", body, token ? { headers: { "X-Danger-Token": token } } : undefined),

  exportTransactions: () => downloadAuthFile("/api/admin/export/transactions", "transactions.csv"),
  exportUsers: () => downloadAuthFile("/api/admin/export/users", "users.csv"),

  // Wallet operations
  wallets: (params?: { search?: string; frozen?: boolean }) =>
    client.get<WalletEntry[]>("/api/admin/wallets", { params }),
  freezeWalletAdmin: (userId: string, reason: string) =>
    client.post(`/api/admin/wallets/${userId}/freeze`, { reason }),
  unfreezeWalletAdmin: (userId: string) =>
    client.post(`/api/admin/wallets/${userId}/unfreeze`),
  adjustWallet: (userId: string, amount: number, note?: string) =>
    client.post<{ ok: boolean; new_balance: number; reference: string }>(
      `/api/admin/wallets/${userId}/adjust`, { amount, note }
    ),

  // Refunds
  refunds: (status?: string) =>
    client.get<RefundRequest[]>("/api/admin/refunds", { params: status ? { status } : {} }),
  createRefund: (body: { user_id: string; transaction_id: string; amount: number; reason: string }) =>
    client.post<{ ok: boolean; id: string }>("/api/admin/refunds", body),
  approveRefund: (id: string) =>
    client.post<{ ok: boolean; reference: string }>(`/api/admin/refunds/${id}/approve`),
  rejectRefund: (id: string, reason: string) =>
    client.post(`/api/admin/refunds/${id}/reject`, { reason }),

  // Feature flags
  featureFlags: () => client.get<FeatureFlag[]>("/api/admin/feature-flags"),
  createFlag: (body: { name: string; description?: string; enabled: boolean; rollout_pct?: number }) =>
    client.post<{ ok: boolean; id: string }>("/api/admin/feature-flags", body),
  updateFlag: (id: string, body: { enabled?: boolean; rollout_pct?: number; description?: string }) =>
    client.patch(`/api/admin/feature-flags/${id}`, body),
  deleteFlag: (id: string) => client.delete(`/api/admin/feature-flags/${id}`),

  // Pricing
  pricingRules: () => client.get<PricingRule[]>("/api/admin/pricing-rules"),
  createPricingRule: (body: Omit<PricingRule, "id" | "zone_name" | "updated_at">) =>
    client.post<{ ok: boolean; id: string }>("/api/admin/pricing-rules", body),
  updatePricingRule: (id: string, body: Partial<PricingRule>) =>
    client.patch(`/api/admin/pricing-rules/${id}`, body),
  deletePricingRule: (id: string) => client.delete(`/api/admin/pricing-rules/${id}`),

  // Promotions
  promotions: () => client.get<Promotion[]>("/api/admin/promotions"),
  createPromotion: (body: Omit<Promotion, "id" | "total_used" | "created_at">) =>
    client.post<{ ok: boolean; id: string }>("/api/admin/promotions", body),
  updatePromotion: (id: string, body: Partial<Promotion>) =>
    client.patch(`/api/admin/promotions/${id}`, body),
  deletePromotion: (id: string) => client.delete(`/api/admin/promotions/${id}`),

  // GDPR
  gdprRequests: () => client.get<GDPRRequest[]>("/api/admin/gdpr/requests"),
  resolveGDPR: (id: string, resolution_note: string) =>
    client.post(`/api/admin/gdpr/requests/${id}/resolve`, { resolution_note }),

  // Geography / Zones
  zones: () => client.get<CoverageZone[]>("/api/admin/zones"),
  createZone: (body: Omit<CoverageZone, "id" | "driver_count" | "created_at">) =>
    client.post<{ ok: boolean; id: string }>("/api/admin/zones", body),
  updateZone: (id: string, body: Partial<CoverageZone>) =>
    client.patch(`/api/admin/zones/${id}`, body),
  deleteZone: (id: string) => client.delete(`/api/admin/zones/${id}`),

  // Chargebacks
  chargebacks: (status?: string) =>
    client.get<Chargeback[]>("/api/admin/chargebacks", { params: status ? { status } : {} }),
  updateChargeback: (id: string, body: { status: string; resolution_note?: string; amount_recovered?: number }) =>
    client.patch(`/api/admin/chargebacks/${id}`, body),

  // Transaction limits
  txLimits: () => client.get<TxLimit[]>("/api/admin/limits"),
  updateTxLimit: (id: string, body: Partial<TxLimit>) =>
    client.patch(`/api/admin/limits/${id}`, body),

  // Referrals
  referrals: (params?: { status?: string; search?: string }) =>
    client.get<{ items: Referral[]; stats: { total: number; rewarded: number; total_rewards: number } }>(
      "/api/admin/referrals", { params }
    ),

  // Feedback
  feedback: (params?: { flagged?: boolean; min_stars?: number; max_stars?: number }) =>
    client.get<{ items: FeedbackItem[]; stats: { total: number; avg_rating: number; flagged_count: number } }>(
      "/api/admin/feedback", { params }
    ),
  flagFeedback: (id: string, reason: string) =>
    client.post(`/api/admin/feedback/${id}/flag`, { reason }),
  unflagFeedback: (id: string) => client.post(`/api/admin/feedback/${id}/unflag`),
  deleteFeedback: (id: string) => client.delete(`/api/admin/feedback/${id}`),

  // Broadcasts
  broadcasts: () => client.get<Broadcast[]>("/api/admin/broadcasts"),
  sendBroadcast: (body: { title: string; body?: string; message?: string; target?: string; target_role?: string }) =>
    client.post<{ ok: boolean; id: string }>("/api/admin/notifications/broadcast", body),

  // Risk
  riskUsers: () => client.get<RiskUser[]>("/api/admin/risk/users"),

  // Reconciliation
  reconBatches: () => client.get<ReconBatch[]>("/api/admin/reconciliation/batches"),
  reconDiscrepancies: (batchId?: string, resolved?: boolean) =>
    client.get<ReconDiscrepancy[]>("/api/admin/reconciliation/discrepancies",
      { params: { ...(batchId ? { batch_id: batchId } : {}), ...(resolved !== undefined ? { resolved } : {}) } }
    ),
  runReconciliation: () =>
    client.post<{ ok: boolean; batch_id: string; status: string; variance: number; discrepancy_count: number; period_start: string; period_end: string }>(
      "/api/admin/reconciliation/run"
    ),
  resolveDiscrepancy: (id: string, resolution_note: string) =>
    client.post(`/api/admin/reconciliation/discrepancies/${id}/resolve`, { resolution_note }),

  // Salary payments
  salaryPayments: (status?: string) =>
    client.get<any[]>("/api/admin/salary-payments", { params: status ? { status } : {} }),
  createSalaryPayment: (body: {
    employee_name: string; staff_id?: string; bank_name: string; account_number: string;
    account_holder: string; branch_code?: string; gross_amount: number; paye_deducted: number;
    uif_deducted: number; net_amount: number; pay_period: string; description?: string;
  }) => client.post<{ ok: boolean; id: string; net_amount: number }>("/api/admin/salary-payments", body),
  approveSalaryPayment: (id: string) => client.post(`/api/admin/salary-payments/${id}/approve`),
  rejectSalaryPayment: (id: string, reason: string) =>
    client.post(`/api/admin/salary-payments/${id}/reject`, { reason }),
  paySalary: (id: string) => client.post<{ ok: boolean; reference: string; net_amount: number }>(`/api/admin/salary-payments/${id}/pay`),
  systemWallet: () => client.get<{ balance: number; total_fees_collected: number; total_salary_paid: number; available: number }>("/api/admin/system-wallet"),

  // Driver transfers
  adminTransfers: (status?: string) =>
    client.get<DriverTransfer[]>("/api/admin/transfers", { params: status ? { status } : {} }),
  adminTransferContactAttempts: (id: string) =>
    client.get<ContactAttempt[]>(`/api/admin/transfers/${id}/contact-attempts`),
  adminLogContact: (id: string, body: { contact_method: string; outcome: string; notes?: string }) =>
    client.post<{ ok: boolean }>(`/api/admin/transfers/${id}/contact-attempt`, body),
  adminTransferApprove: (id: string, note: string) =>
    client.post<{ ok: boolean }>(`/api/admin/transfers/${id}/admin-approve`, { note }),
  adminTransferReject: (id: string, note: string) =>
    client.post<{ ok: boolean }>(`/api/admin/transfers/${id}/admin-reject`, { note }),
};

export type DriverTransfer = {
  id: string;
  driver_user_id: string;
  driver_name: string;
  driver_phone: string;
  old_owner_id: string | null;
  old_owner_user_id: string | null;
  old_owner_name: string | null;
  new_owner_id: string;
  new_owner_user_id: string;
  new_owner_name: string;
  status: string;
  old_owner_reject_reason: string | null;
  new_owner_reject_reason: string | null;
  reminder_sent_at: string | null;
  escalated_at: string | null;
  admin_override_note: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ContactAttempt = {
  id: string;
  admin_name: string;
  contact_method: string;
  outcome: string;
  notes: string | null;
  attempted_at: string;
};
