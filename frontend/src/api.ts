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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }

  if (!res.ok) {
    const detail = data?.detail;
    const msg = Array.isArray(detail)
      ? detail.map((d: any) => d?.msg || JSON.stringify(d)).join(", ")
      : typeof detail === "string"
      ? detail
      : `Request failed (${res.status})`;

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
    role: "passenger" | "driver";
    vehicle_plate?: string;
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
      {
        method: "POST",
        body: JSON.stringify(body),
      }
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
};

// ── Types ──
export type User = {
  id: string;
  phone_number: string;
  full_name: string;
  role: "passenger" | "driver";
  vehicle_plate?: string;
};

export type Wallet = {
  balance: number;
  currency: string;
  is_frozen: boolean;
  qr_code?: string;
  vehicle_plate?: string;
  total_earnings?: number;
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
