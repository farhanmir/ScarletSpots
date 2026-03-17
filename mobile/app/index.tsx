import { Redirect } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import * as Location from "expo-location";

export default function Index() {
  const { loading: authLoading } = useAuth();
  const [checkingPerms, setCheckingPerms] = useState(true);
  const [needsPermissions, setNeedsPermissions] = useState(false);

  useEffect(() => {
    (async () => {
      // Check strict requirements without auto-requesting from this splash route.
      const fg = await Location.getForegroundPermissionsAsync();
      const bg = await Location.getBackgroundPermissionsAsync();
      const preciseOk =
        (fg.ios?.accuracy ? fg.ios.accuracy === "full" : true) &&
        (fg.android?.accuracy ? fg.android.accuracy === "fine" : true);
      const needsLocationSetup =
        fg.status !== "granted" || bg.status !== "granted" || !preciseOk;
      setNeedsPermissions(needsLocationSetup);
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
