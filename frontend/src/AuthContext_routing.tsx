import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "../src/AuthContext";

export function useProtectedRoute() {
  const { state } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "loading") return;

    const inAuth = segments[0] === "(auth)";
    const inApp = segments[0] === "(app)";
    const inOwner = segments[0] === "(owner)";

    if (state.status === "guest") {
      if (!inAuth) router.replace("/(auth)/welcome");
      return;
    }

    if (state.status === "authed") {
      const role = state.user.role;

      if (["admin", "superadmin", "finance", "support", "ceo", "cto", "cfo"].includes(role)) {
        router.replace("/(auth)/welcome");
        return;
      }

      if (role === "owner") {
        if (!inOwner) router.replace("/(owner)/dashboard");
        return;
      }

      if (["driver", "passenger"].includes(role)) {
        if (!inApp) router.replace("/(app)");
        return;
      }
    }
  }, [state.status, segments]);
}
