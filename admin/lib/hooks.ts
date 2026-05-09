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
    onSuccess: () => toast.success("PIN reset successfully"),
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
