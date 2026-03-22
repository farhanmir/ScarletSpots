import React from "react";
import { View, Text, StyleSheet, useColorScheme } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * A slim offline indicator banner shown at the top of the screen.
 *
 * Since lot data is bundled in the app, offline mode is graceful:
 * the map still loads with full lot polygons and last-known occupancy.
 * Only park/end session actions are queued for sync.
 */
export default function OfflineBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme !== "light";

  // Only show when we explicitly know the device is disconnected.
  // null = still loading, true = connected — don't show in either case.
  if (netInfo.isConnected === null || netInfo.isConnected === true) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: isDark ? "#27272a" : "#e4e4e7",
          borderBottomColor: isDark ? "#3f3f46" : "#d4d4d8",
        },
      ]}
    >
      <View style={styles.banner}>
        <Ionicons
          name="wifi-outline"
          size={13}
          color={isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.6)"}
        />
        <Text style={[styles.text, !isDark && { color: "rgba(0,0,0,0.7)" }]}>
          Offline — parking actions will sync when reconnected
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    zIndex: 999,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 6,
  },
  text: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "500",
  },
});
