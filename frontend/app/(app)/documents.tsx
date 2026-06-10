import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";

export default function DocumentsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace({ pathname: "/(app)/notifications", params: { tab: "docs" } } as any);
  }, []);
  return <View />;
}
