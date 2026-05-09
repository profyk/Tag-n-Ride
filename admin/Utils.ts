import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) { return clsx(inputs); }

export function formatZAR(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);
}

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

export function maskAccount(n: string) {
  return n.length <= 4 ? "****" : "****" + n.slice(-4);
}
