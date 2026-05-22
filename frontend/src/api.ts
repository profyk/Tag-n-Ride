import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = "https://tag-n-ride-production.up.railway.app";
const TOKEN_KEY = "tnr_token";

export const tokenStore = {
  get: () => AsyncStorage.getItem(TOKEN_KEY),
  set: (t: string) => AsyncStorage.setItem(TOKEN_KEY, t),
  clear: () => AsyncStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await tokenStore.get();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = { detail: text }; }
  if (!res.ok) {
    const detail = data?.detail;
    const msg = Array.isArray(detail)
      ? detail.map((d: any) => d?.msg || JSON.stringify(d)).join(", ")
      : typeof detail === "string" ? detail : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  // ── Auth ──
  register: (body: {
    phone_number: string;
    full_name: string;
    pin: string;
    role: "passenger" | "driver" | "owner";
    vehicle_plate?: string;
    business_name?: string;
  }) =>
    request<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { phone_number: string; pin: string }) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => request<User>("/api/auth/me"),

  changePin: (body: { current_pin: string; new_pin: string }) =>
    request<{ ok: boolean }>("/api/auth/change-pin", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateDriverProfile: (vehicle_plate: string) =>
    request<{ vehicle_plate: string }>("/api/driver/profile", {
      method: "PATCH",
      body: JSON.stringify({ vehicle_plate }),
    }),

  // ── Wallet ──
  wallet: () => request<Wallet>("/api/wallet"),

  topup: (amount: number) =>
    request<{ balance: number; transaction: Txn }>("/api/wallet/topup", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  lookupDriver: (driverId: string) =>
    request<DriverInfo>(`/api/wallet/driver/${driverId}`),

  lookupDriverByQR: (qrCode: string) =>
    request<DriverInfo>(`/api/wallet/driver/qr/${qrCode}`),

  transfer: (driver_user_id: string, amount: number, note?: string) =>
    request<{ balance: number; transaction: Txn }>("/api/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({ driver_user_id, amount, note }),
    }),

  transactions: () => request<Txn[]>("/api/wallet/transactions"),

  withdraw: (body: {
    amount: number;
    bank_name?: string;
    account_number?: string;
    account_name?: string;
  }) =>
    request<{ balance: number; withdrawal: any; transaction: Txn }>(
      "/api/wallet/withdraw",
      { method: "POST", body: JSON.stringify(body) }
    ),

  withdrawals: () => request<any[]>("/api/wallet/withdrawals"),

  rate: (body: {
    driver_user_id: string;
    transaction_id: string;
    stars: number;
    comment?: string;
  }) =>
    request<{ ok: boolean }>("/api/wallet/rate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Payout accounts ──
  getPayoutAccounts: () =>
    request<PayoutAccount[]>("/api/wallet/payout-account"),

  savePayoutAccount: (body: {
    bank_name: string;
    account_number: string;
    account_name?: string;
    type: "self" | "owner";
  }) =>
    request<PayoutAccount>("/api/wallet/payout-account", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── CashUp ──
  cashup: (body: { amount: number; type: "self" | "owner" }) =>
    request<{
      balance: number;
      withdrawal: any;
      transaction: Txn;
      payout_type: string;
    }>("/api/wallet/cashup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── KYC ──
  submitKyc: async (selfieBase64: string, licenceBase64: string) => {
    const token = await tokenStore.get();
    const formData = new FormData();
    formData.append("selfie", {
      uri: `data:image/jpeg;base64,${selfieBase64}`,
      name: "selfie.jpg",
      type: "image/jpeg",
    } as any);
    formData.append("licence_front", {
      uri: `data:image/jpeg;base64,${licenceBase64}`,
      name: "licence.jpg",
      type: "image/jpeg",
    } as any);
    const res = await fetch(`${BASE}/api/kyc/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "KYC upload failed");
    }
    return res.json();
  },

  kycStatus: () =>
    request<{
      status: "not_submitted" | "pending" | "approved" | "rejected";
      rejection_reason?: string;
      submitted_at?: string;
    }>("/api/kyc/status"),

  // ── Notifications ──
  getNotifications: () =>
    request<Notification[]>("/api/notifications"),

  deleteNotification: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}`, {
      method: "DELETE",
    }),

  clearAllNotifications: () =>
    request<{ ok: boolean }>("/api/notifications", {
      method: "DELETE",
    }),

  // ── Owner ──
  ownerDashboard: () =>
    request<{
      total_earnings: number;
      today_revenue: number;
      driver_count: number;
      drivers: {
        user_id: string;
        full_name: string;
        phone_number: string;
        vehicle_plate: string;
        total_earnings: number;
        qr_code: string;
        rating_avg: number;
        rating_count: number;
        is_verified: boolean;
      }[];
    }>("/api/owner/dashboard"),

  ownerLinkDriver: (driver_code: string) =>
    request<{
      ok: boolean;
      driver: {
        user_id: string;
        full_name: string;
        phone_number: string;
        vehicle_plate: string;
        qr_code: string;
      };
    }>("/api/owner/drivers/link", {
      method: "POST",
      body: JSON.stringify({ driver_code }),
    }),

  ownerUnlinkDriver: (driver_user_id: string) =>
    request<{ ok: boolean }>(`/api/owner/drivers/${driver_user_id}`, {
      method: "DELETE",
    }),

  ownerDriverEarnings: (driver_user_id: string) =>
    request<{
      driver: {
        user_id: string;
        full_name: string;
        phone_number: string;
        vehicle_plate: string;
        total_earnings: number;
        qr_code: string;
        rating_avg: number;
        rating_count: number;
      };
      today_total: number;
      today_trip_count: number;
      today_trips: {
        reference: string;
        amount: number;
        driver_net: number;
        passenger: string;
        created_at: string;
      }[];
      all_trips: {
        reference: string;
        amount: number;
        driver_net: number;
        passenger: string;
        created_at: string;
      }[];
    }>(`/api/owner/drivers/${driver_user_id}/earnings`),

  ownerTransactions: () =>
    request<{
      id: string;
      reference: string;
      driver_name: string;
      vehicle_plate: string;
      passenger: string;
      gross_amount: number;
      driver_net: number;
      platform_fee: number;
      created_at: string;
    }[]>("/api/owner/transactions"),

  ownerToggleDriverMode: (active: boolean) =>
    request<{ ok: boolean; driver_mode_active: boolean }>(
      "/api/owner/toggle-driver-mode",
      { method: "POST", body: JSON.stringify({ active }) }
    ),
};

// ── Types ──
export type User = {
  id: string;
  phone_number: string;
  full_name: string;
  role: "passenger" | "driver" | "owner";
  vehicle_plate?: string;
  is_verified?: boolean;
  driver_mode_active?: boolean;
};

export type Wallet = {
  balance: number;
  currency: string;
  is_frozen: boolean;
  driver_mode_active?: boolean;
  qr_code?: string;
  vehicle_plate?: string;
  total_earnings?: number;
  is_verified?: boolean;
  rating_avg?: number;
  rating_count?: number;
};

export type Txn = {
  id: string;
  reference: string;
  type: "topup" | "payment" | "withdrawal";
  status: string;
  amount: number;
  currency: string;
  sender_id: string | null;
  receiver_id: string | null;
  note?: string;
  created_at: string;
  counterparty_name?: string | null;
  direction?: "in" | "out";
};

export type DriverInfo = {
  user_id: string;
  full_name: string;
  phone_number: string;
  qr_code: string;
  vehicle_plate?: string;
  is_verified: boolean;
  rating_avg: number;
  rating_count: number;
};

export type PayoutAccount = {
  id: string;
  user_id: string;
  type: "self" | "owner";
  bank_name: string;
  account_number: string;
  account_name?: string;
  created_at: string;
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  target: string;
  sent_at: string;
  read?: boolean;
};
