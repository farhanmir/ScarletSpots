import { Redirect } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const { loading: authLoading } = useAuth();

  if (authLoading) {
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
