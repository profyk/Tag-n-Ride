import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = "https://tag-n-ride-production.up.railway.app";
const TOKEN_KEY = "tnr_token";

export const tokenStore = {
  get: () => AsyncStorage.getItem(TOKEN_KEY),
  set: (t: string) => AsyncStorage.setItem(TOKEN_KEY, t),
  clear: () => AsyncStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, opts: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const token = await tokenStore.get();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { ...opts, headers, signal: controller.signal });
    clearTimeout(timeoutId);
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
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error("Request timed out. Check your connection and try again.");
    throw e;
  }
}

export const api = {
  // ── Auth ──
  register: (body: {
    phone_number?: string;
    full_name: string;
    surname: string;
    pin: string;
    role: "passenger" | "driver" | "owner";
    vehicle_plate?: string;
    business_name?: string;
    id_number?: string;
    email?: string;
    password?: string;
    driver_mode?: boolean;
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

  ownerLogin: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/owner-login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  ownerChangePassword: (body: { current_password: string; new_password: string }) =>
    request<{ ok: boolean }>("/api/owner/change-password", {
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

  topupInitiate: (amount: number) =>
    request<{
      payment_id: string;
      redirect_url: string;
      wallet_amount: number;
      processing_fee: number;
      charge_amount: number;
      gateway_fee: number;
      operations_income: number;
      processing_fee_pct: number;
      sandbox: boolean;
    }>("/api/wallet/topup/initiate", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  verifyTopup: (payment_id: string) =>
    request<{
      payment_id: string;
      status: string;
      charge_amount: number;
      wallet_amount: number;
      processing_fee: number;
      balance: number;
      completed: boolean;
    }>(`/api/wallet/topup/verify/${payment_id}`),

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

  submitDispute: (body: { transaction_id: string; reason: string; category?: string }) =>
    request<{ ok: boolean }>("/api/wallet/dispute", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  myDisputes: () => request<Dispute[]>("/api/wallet/disputes"),

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

  // ── Driver cash-up ──
  driverCashupStatus: () => request<any>("/api/driver/cashup-status"),

  driverCashupDestination: () => request<any>("/api/driver/cashup-destination"),

  driverCashupV2: (owner_user_id: string, method: "wallet" | "bank", amount: number) =>
    request<any>("/api/driver/cashup/v2", {
      method: "POST",
      body: JSON.stringify({ owner_user_id, method, amount }),
    }),

  driverPayout: (amount: number) =>
    request<any>("/api/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  driverOutstanding: () => request<any>("/api/driver/outstanding"),

  driverPayOutstanding: (outstanding_id: string) =>
    request<any>("/api/driver/outstanding/pay", {
      method: "POST",
      body: JSON.stringify({ outstanding_id }),
    }),

  driverCashupHistory: () => request<any[]>("/api/driver/cashup-history"),

  // ── Owner cash-up management ──
  ownerConfirmDriver: (driver_user_id: string) =>
    request<any>(`/api/owner/drivers/${driver_user_id}/confirm`, {
      method: "POST",
    }),

  ownerUnconfirmDriver: (driver_user_id: string) =>
    request<any>(`/api/owner/drivers/${driver_user_id}/unconfirm`, {
      method: "POST",
    }),

  ownerSetCashupMethod: (method: "wallet" | "bank") =>
    request<any>("/api/owner/cashup-method", {
      method: "PATCH",
      body: JSON.stringify({ method }),
    }),

  ownerSaveBank: (body: {
    bank_name: string;
    account_number: string;
    account_name?: string;
  }) =>
    request<any>("/api/owner/bank-account", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  ownerGetBank: () => request<any>("/api/owner/bank-account"),

  ownerPayout: (amount: number) =>
    request<any>("/api/owner/payout", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  ownerWallet: () => request<any>("/api/wallet"),

  ownerOutstanding: () => request<any>("/api/owner/outstanding"),

  ownerCancelOutstanding: (outstanding_id: string) =>
    request<any>(`/api/owner/outstanding/${outstanding_id}/cancel`, {
      method: "POST",
    }),

  ownerCashupHistory: () => request<any>("/api/owner/cashup-history"),

  // ── KYC ──
  kycSubmit: async (
    selfie: { uri: string; type: string; name: string },
    licence: { uri: string; type: string; name: string }
  ) => {
    const token = await tokenStore.get();
    const formData = new FormData();
    formData.append("selfie", {
      uri: selfie.uri,
      name: selfie.name,
      type: selfie.type,
    } as any);
    formData.append("licence_front", {
      uri: licence.uri,
      name: licence.name,
      type: licence.type,
    } as any);
    const res = await fetch(`${BASE}/api/kyc/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try { msg = JSON.parse(text)?.detail || text; } catch {}
      throw new Error(msg || "KYC upload failed");
    }
    return res.json();
  },

  kycStatus: () =>
    request<{
      status: "not_submitted" | "pending" | "approved" | "rejected";
      rejection_reason?: string;
      submitted_at?: string;
    }>("/api/kyc/status"),

  kycSelfieUrl: () =>
    request<{ url: string }>("/api/kyc/selfie-url"),

  // ── Notifications ──
  getNotifications: () =>
    request<Notification[]>("/api/user/notifications"),

  deleteNotification: (id: string) =>
    request<{ ok: boolean }>(`/api/user/notifications/${id}`, {
      method: "DELETE",
    }),

  clearAllNotifications: () =>
    request<{ ok: boolean }>("/api/user/notifications", {
      method: "DELETE",
    }),

  // ── Driver Routes ──
  startRoute: (fare: number) =>
    request<{ ok: boolean; route_id: string }>("/api/driver/route/start", {
      method: "POST",
      body: JSON.stringify({ fare }),
    }),

  endRoute: () =>
    request<{ ok: boolean; summary: any }>("/api/driver/route/end", {
      method: "POST",
    }),

  currentRoute: () => request<any>("/api/driver/route/current"),

  updateCash: (delta: 1 | -1) =>
    request<{ ok: boolean; cash_count: number }>("/api/driver/route/cash", {
      method: "PATCH",
      body: JSON.stringify({ delta }),
    }),

  routeHistory: () => request<any[]>("/api/driver/route/history"),

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
        payment_mode: "daily_target" | "commission_split";
        driver_commission_pct: number;
        commission_status: string | null;
        daily_target: number;
      }[];
    }>("/api/owner/dashboard"),

  ownerSetCommission: (driver_user_id: string, driver_commission_pct: number) =>
    request<{ ok: boolean; commission_status: string; message: string }>(
      `/api/owner/drivers/${driver_user_id}/set-commission`,
      { method: "POST", body: JSON.stringify({ driver_commission_pct }) }
    ),

  ownerRemoveCommission: (driver_user_id: string) =>
    request<{ ok: boolean; payment_mode: string }>(
      `/api/owner/drivers/${driver_user_id}/commission`,
      { method: "DELETE" }
    ),

  ownerSetTarget: (driver_user_id: string, daily_target: number) =>
    request<{ ok: boolean; daily_target: number }>(
      `/api/owner/drivers/${driver_user_id}/set-target`,
      { method: "POST", body: JSON.stringify({ daily_target }) }
    ),

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

  // ── Driver transfer ──
  transferRequest: (owner_code: string) =>
    request<{ ok: boolean; transfer_id: string; status: string }>("/api/driver/transfer/request", {
      method: "POST",
      body: JSON.stringify({ owner_code }),
    }),

  transferActive: () =>
    request<{ transfer: DriverTransfer | null }>("/api/driver/transfer/active"),

  transferCancel: (transfer_id: string) =>
    request<{ ok: boolean }>(`/api/driver/transfer/${transfer_id}`, { method: "DELETE" }),

  ownerTransfers: () =>
    request<DriverTransfer[]>("/api/owner/transfers"),

  ownerTransferApprove: (transfer_id: string) =>
    request<{ ok: boolean }>(`/api/owner/transfer/${transfer_id}/approve`, { method: "POST" }),

  ownerTransferReject: (transfer_id: string, reason: string) =>
    request<{ ok: boolean }>(`/api/owner/transfer/${transfer_id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // ── Subscriptions ──
  ownerSubscription: () =>
    request<{
      subscription: {
        status: string; taxi_count: number; free_taxis: number;
        billable_taxis: number; monthly_fee: number;
        next_billing_date: string | null; last_billed_date: string | null;
        overdue_since: string | null;
      };
      billing_history: {
        id: string; period: string; taxi_count: number;
        billable_taxis: number; amount: number; status: string; billed_at: string;
      }[];
    }>("/api/owner/subscription"),

  // ── Statements ──
  ownerStatementPricing: () =>
    request<{ enabled: boolean; price: number }>("/api/owner/statement/pricing"),

  passengerStatementPricing: () =>
    request<{ enabled: boolean; price: number }>("/api/passenger/statement/pricing"),

  requestOwnerStatement: (period_start: string, period_end: string) =>
    request<{ statement_id: string; reference: string; amount_charged: number; data: any }>(
      "/api/owner/statement/request",
      { method: "POST", body: JSON.stringify({ period_start, period_end }) }
    ),
  getOwnerStatement: (id: string) =>
    request<{ statement_id: string; reference: string; data: any; created_at: string }>(
      `/api/owner/statement/${id}`
    ),
  requestPassengerStatement: (period_start: string, period_end: string) =>
    request<{ statement_id: string; reference: string; amount_charged: number; data: any }>(
      "/api/passenger/statement/request",
      { method: "POST", body: JSON.stringify({ period_start, period_end }) }
    ),
  getPassengerStatement: (id: string) =>
    request<{ statement_id: string; reference: string; data: any; created_at: string }>(
      `/api/passenger/statement/${id}`
    ),

  // ── Driver Payslips ──
  payslipPricing: () =>
    request<{
      enabled: boolean;
      fee_1month: number;
      fee_3months: number;
      fee_6months: number;
      fee_12months: number;
    }>("/api/driver/payslip/pricing"),

  formalPayslipPricing: () =>
    request<{
      enabled: boolean;
      fee_1month: number;
      fee_3months: number;
      fee_6months: number;
      fee_12months: number;
    }>("/api/driver/formal-payslip/pricing"),

  payslipRequest: (body: { period_type: string; month: string }) =>
    request<any>("/api/driver/payslip/request", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  formalPayslipRequest: (body: { period_type: string; month: string }) =>
    request<any>("/api/driver/formal-payslip/request", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  payslipHistory: () => request<any[]>("/api/driver/payslip/history"),

  payslipGet: (id: string) => request<any>(`/api/driver/payslip/${id}`),

  payslipDelete: (id: string) =>
    request<{ ok: boolean }>(`/api/driver/payslip/${id}`, { method: "DELETE" }),

  payslipVerify: (ref: string) =>
    request<{
      valid: boolean;
      document_type?: string;
      driver_name?: string;
      phone?: string;
      period_label?: string;
      driver_net_earnings?: number;
      total_trips?: number;
      issued_by?: string;
      verified_at?: string;
    }>(`/api/driver/payslip/verify?ref=${encodeURIComponent(ref)}`),

  // ── Admin: Payout settings ──
  getPayoutSettings: () =>
    request<PayoutSettings>("/api/admin/payout-settings"),

  updatePayoutSettings: (body: Partial<PayoutSettings>) =>
    request<PayoutSettings>("/api/admin/payout-settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // ── SafeRide ──
  safetyProfile: () => request<any>("/api/safety/profile"),

  saveSafetyProfile: (body: {
    full_name?: string; id_number?: string; passport_number?: string; date_of_birth?: string; blood_type?: string;
    home_address?: string; medical_conditions?: string; allergies?: string;
    emergency_contact_1_name?: string; emergency_contact_1_phone?: string; emergency_contact_1_relationship?: string;
    emergency_contact_2_name?: string; emergency_contact_2_phone?: string; emergency_contact_2_relationship?: string;
    next_of_kin_name?: string; next_of_kin_phone?: string; next_of_kin_relationship?: string;
  }) => request<any>("/api/safety/profile", { method: "POST", body: JSON.stringify(body) }),

  saveSafetySelfie: async (selfie: { uri: string; type: string; name: string }) => {
    const token = await tokenStore.get();
    const formData = new FormData();
    formData.append("selfie", { uri: selfie.uri, name: selfie.name, type: selfie.type } as any);
    const res = await fetch(`${BASE}/api/safety/selfie`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try { msg = JSON.parse(text)?.detail || text; } catch {}
      throw new Error(msg || "Selfie upload failed");
    }
    return res.json();
  },

  safetySelfieUrl: () => request<{ url: string }>("/api/safety/selfie-url"),

  updateSafetyProfile: (body: {
    id_number?: string; blood_type?: string; home_address?: string;
    medical_conditions?: string; allergies?: string;
    emergency_contact_1_name?: string; emergency_contact_1_phone?: string; emergency_contact_1_relationship?: string;
    emergency_contact_2_name?: string; emergency_contact_2_phone?: string; emergency_contact_2_relationship?: string;
    next_of_kin_name?: string; next_of_kin_phone?: string; next_of_kin_relationship?: string;
  }) => request<any>("/api/safety/profile", { method: "PATCH", body: JSON.stringify(body) }),

  tripsStart: (body: { latitude?: number; longitude?: number }) =>
    request<any>("/api/trips/start", { method: "POST", body: JSON.stringify(body) }),

  tripsActive: () => request<{ trip: any; passengers: any[] }>("/api/trips/active"),

  tripsEnd: (body: { trip_id: string; latitude?: number; longitude?: number }) =>
    request<any>("/api/trips/end", { method: "POST", body: JSON.stringify(body) }),

  tripsEndPin: (body: { trip_id: string; pin: string; latitude?: number; longitude?: number }) =>
    request<{ ok: boolean; ended: boolean; stealth: boolean }>("/api/saferide/trip/end-pin", {
      method: "POST", body: JSON.stringify(body),
    }),

  setDeadManCode: (body: { dead_man_code: string; current_pin: string }) =>
    request<{ ok: boolean }>("/api/saferide/deadman-code", { method: "POST", body: JSON.stringify(body) }),

  sosCancelPin: (body: { sos_id: string; pin: string }) =>
    request<{ ok: boolean; cancelled: boolean; stealth: boolean }>("/api/saferide/sos/cancel-pin", {
      method: "POST", body: JSON.stringify(body),
    }),

  ghostPing: (body: { latitude: number; longitude: number }) =>
    request<{ ok: boolean; continue: boolean }>("/api/saferide/ghost-ping", {
      method: "POST", body: JSON.stringify(body),
    }),

  tripsLocation: (body: { trip_id: string; latitude: number; longitude: number; speed?: number; heading?: number }) =>
    request<any>("/api/trips/location", { method: "POST", body: JSON.stringify(body) }),

  tripsHistory: () => request<any[]>("/api/trips/history"),

  tripsGet: (id: string) => request<any>(`/api/trips/${id}`),

  tripsUpdateDetails: (trip_id: string, body: { cash_passengers?: number; taxi_capacity?: number }) =>
    request<any>(`/api/trips/${trip_id}/details`, { method: "PATCH", body: JSON.stringify(body) }),

  tripsShare: (body: { trip_id: string }) =>
    request<{ share_url: string; trip_reference: string }>("/api/trips/share", {
      method: "POST", body: JSON.stringify(body),
    }),

  tripsTrack: (ref: string) => request<any>(`/api/trips/track/${ref}`),

  tripsPassengerCurrent: () => request<{ trip: any | null }>("/api/trips/passenger-current"),

  trackMeFee: () => request<{ fee: number; enabled: boolean }>("/api/track-me/fee"),
  trackMeStart: (body: { latitude?: number; longitude?: number }) =>
    request<{ session_id: string; trip_reference: string; share_url: string; fee_charged: number; already_active: boolean }>("/api/track-me/start", {
      method: "POST", body: JSON.stringify(body),
    }),
  trackMePing: (sessionId: string, body: { latitude: number; longitude: number; accuracy?: number }) =>
    request<{ ok: boolean }>(`/api/track-me/${sessionId}/ping`, {
      method: "POST", body: JSON.stringify(body),
    }),
  trackMeEnd: (sessionId: string) =>
    request<{ ok: boolean }>(`/api/track-me/${sessionId}/end`, { method: "POST", body: "{}" }),
  trackMeEndPin: (body: { trip_id: string; pin: string; latitude?: number; longitude?: number }) =>
    request<{ ok: boolean; ended: boolean; stealth: boolean }>("/api/track-me/end-pin", {
      method: "POST", body: JSON.stringify(body),
    }),
  trackMeActive: () => request<{ session: { id: string; trip_reference: string; share_url: string; started_at: string } | null }>("/api/track-me/active"),

  adminDriverLocations: () => request<any[]>("/api/trips/driver-locations"),

  adminIncidents: () => request<any[]>("/api/admin/incidents"),

  adminCreateIncident: (body: {
    vehicle_plate: string; trip_id?: string; incident_type?: string;
    description?: string; latitude?: number; longitude?: number;
  }) => request<any>("/api/admin/incidents", { method: "POST", body: JSON.stringify(body) }),

  adminIncidentGet: (id: string) => request<any>(`/api/admin/incidents/${id}`),

  adminIncidentResolve: (id: string, body: { resolution_notes: string }) =>
    request<any>(`/api/admin/incidents/${id}/resolve`, { method: "PATCH", body: JSON.stringify(body) }),

  adminSafeRideSearch: (plate: string) =>
    request<any>(`/api/admin/saferide/search?plate=${encodeURIComponent(plate)}`),

  safetyPanic: (body: { latitude?: number; longitude?: number }) =>
    request<any>("/api/safety/panic", { method: "POST", body: JSON.stringify(body) }),

  sosRequest: (body: { emergency_type: "police" | "ambulance"; latitude?: number; longitude?: number }) =>
    request<{ ok: boolean; sos_id: string }>("/api/saferide/sos", { method: "POST", body: JSON.stringify(body) }),

  sosLocationPing: (sosId: string, body: { latitude: number; longitude: number }) =>
    request<{ ok: boolean; resolved: boolean; help_coming: boolean }>(`/api/saferide/sos/${sosId}/location`, { method: "POST", body: JSON.stringify(body) }),

  sosReceived: (sosId: string) =>
    request<{ ok: boolean }>(`/api/saferide/sos/${sosId}/received`, { method: "PATCH" }),

  // ── User Documents ──
  documents: () => request<UserDocument[]>("/api/documents"),
  documentsUnreadCount: () => request<{ count: number }>("/api/documents/unread-count"),
  documentRead: (id: string) =>
    request<{ ok: boolean }>(`/api/documents/${id}/read`, { method: "PATCH" }),
  documentReadAll: () =>
    request<{ ok: boolean }>("/api/documents/read-all", { method: "PATCH" }),
  documentDelete: (id: string) =>
    request<{ ok: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),
  documentGet: (id: string) => request<UserDocument>(`/api/documents/${id}`),
};

// ── Types ──
export type PayoutSettings = {
  require_approval: boolean;
  auto_approve_limit: number;
  pay_fuel_enabled: boolean;
  pay_fuel_max_per_txn: number;
  pay_fuel_daily_limit: number;
  commission_auto_cashup_time: string | null;
  subscription_price_per_taxi: number;
  subscription_free_taxis: number;
  owner_statement_price: number;
  passenger_statement_price: number;
  updated_at: string | null;
};

export type User = {
  id: string;
  phone_number?: string;   // optional — owners identify by email
  full_name: string;
  surname?: string;
  id_number?: string;
  email?: string;
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
  today_total?: number;
  today_gross?: number;
  today_platform_fee?: number;
  today_trip_count?: number;
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
  platform_fee?: number;
  driver_net?: number;
  gross_amount?: number;
};

export type Dispute = {
  id: string;
  transaction_id: string | null;
  reason: string;
  category?: string;
  status: "open" | "resolved";
  resolution?: string;
  created_at: string;
  resolved_at?: string;
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

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  target: string;
  sent_at: string;
  read?: boolean;
};

export type UserDocument = {
  id: string;
  document_type: "statement" | "payslip" | "receipt" | "kyc" | "withdrawal" | "topup" | "notice" | "contract";
  title: string;
  description?: string;
  period_label?: string;
  amount: number;
  reference_number?: string;
  is_read: boolean;
  status: string;
  metadata?: Record<string, any>;
  created_at: string;
};
