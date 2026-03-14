import { Redirect } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import * as Location from "expo-location";

export default function Index() {
  const { loading: authLoading } = useAuth();
  const [checkingPerms, setCheckingPerms] = useState(true);

  useEffect(() => {
    (async () => {
      // Check if we already have permission without asking
      await Location.getForegroundPermissionsAsync();
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

  // 3. Go to Map
  return <Redirect href={"/(tabs)" as any} />;
}
