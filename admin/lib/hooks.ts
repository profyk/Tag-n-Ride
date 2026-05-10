import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import toast from "react-hot-toast";

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboard().then((r) => r.data) });

export const useUsers = (search?: string) =>
  useQuery({ queryKey: ["users", search], queryFn: () => api.users(search).then((r) => r.data) });

export const useDrivers = () =>
  useQuery({ queryKey: ["drivers"], queryFn: () => api.drivers().then((r) => r.data) });

export const useDriverDetail = (id: string) =>
  useQuery({ queryKey: ["driver", id], queryFn: () => api.driverDetail(id).then((r) => r.data), enabled: !!id });

export const useTransactions = (params?: { type?: string; from?: string; to?: string }) =>
  useQuery({ queryKey: ["transactions", params], queryFn: () => api.transactions(params).then((r) => r.data) });

export const useWithdrawals = () =>
  useQuery({ queryKey: ["withdrawals"], queryFn: () => api.withdrawals().then((r) => r.data) });

export const usePayouts = () =>
  useQuery({ queryKey: ["payouts"], queryFn: () => api.payoutAccounts().then((r) => r.data) });

export const useAnalytics = () =>
  useQuery({ queryKey: ["analytics"], queryFn: () => api.analytics().then((r) => r.data) });

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, block }: { id: string; block: boolean }) =>
      block ? api.blockUser(id) : api.unblockUser(id),
    onSuccess: (_, { block }) => {
      toast.success(block ? "User blocked" : "User unblocked");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useResetPin() {
  return useMutation({
    mutationFn: (id: string) => api.resetPin(id),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useVerifyDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.verifyDriver(id),
    onSuccess: () => { toast.success("Driver verified"); qc.invalidateQueries({ queryKey: ["drivers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useWithdrawalAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      action === "approve" ? api.approveWithdrawal(id) : api.rejectWithdrawal(id),
    onSuccess: (_, { action }) => {
      toast.success(action === "approve" ? "Withdrawal approved" : "Withdrawal rejected");
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const useAdmins = () =>
  useQuery({ queryKey: ["admins"], queryFn: () => api.listAdmins().then((r) => r.data) });

export function useCreateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { full_name: string; email: string; password: string }) =>
      api.createAdmin(body),
    onSuccess: () => {
      toast.success("Admin created successfully");
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAdmin(id),
    onSuccess: () => {
      toast.success("Admin deleted");
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useFreezeWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, freeze }: { id: string; freeze: boolean }) =>
      freeze ? api.freezeWallet(id) : api.unfreezeWallet(id),
    onSuccess: (_: unknown, { freeze }: { id: string; freeze: boolean }) => {
      toast.success(freeze ? "Wallet frozen" : "Wallet unfrozen");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTransferFunds() {
  return useMutation({
    mutationFn: (body: { from_user_id: string; to_user_id: string; amount: number; note?: string }) =>
      api.transferFunds(body),
    onSuccess: () => toast.success("Funds transferred successfully"),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdjustBalance() {
  return useMutation({
    mutationFn: (body: { user_id: string; amount: number; note?: string }) =>
      api.adjustBalance(body),
    onSuccess: (r: { data: { new_balance: number } }) =>
      toast.success(`Balance updated. New balance: R${r.data.new_balance.toFixed(2)}`),
    onError: (e: Error) => toast.error(e.message),
  });
}

export const useUserWallet = (id: string) =>
  useQuery({
    queryKey: ["wallet", id],
    queryFn: () => api.getUserWallet(id).then((r) => r.data),
    enabled: !!id,
  });
