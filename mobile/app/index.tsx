import { Redirect } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { needsOnboardingRedirect } from "@/shared/services/AutoParkCapability";

export default function Index() {
  const { loading: authLoading } = useAuth();
  const [checkingPerms, setCheckingPerms] = useState(true);
  const [needsPermissions, setNeedsPermissions] = useState(false);

  useEffect(() => {
    (async () => {
      const redirect = await needsOnboardingRedirect();
      setNeedsPermissions(redirect);
      setCheckingPerms(false);
    })();
  }, []);

  if (authLoading || checkingPerms) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#dc2626" />
      </View>
    );
  }

  if (needsPermissions) {
    return <Redirect href={"/onboarding/permissions" as any} />;
  }

  // 3. Go to Map
  return <Redirect href={"/(tabs)" as any} />;
}
