import React, { useMemo, useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { GlassCard } from "@/shared/components/ui/GlassCard";
import { GlassSegmentedControl } from "@/shared/components/ui/GlassSegmentedControl";
import { GlassBackground } from "@/shared/components/ui/GlassBackground";
import { ScarletSpotsBackground } from "@/shared/components/ui/ScarletSpotsBackground";
import { GLASS_DARK, useGlassTheme } from "@/shared/components/ui/glassTheme";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WEBSOCKET_BASE_URL } from "@/shared/api/api-base";
import { authApiCall } from "@/shared/api/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { getLotById } from "@/shared/constants/lots";
import PERMIT_MAPPING from "@/shared/constants/permit_mapping.json";
import { createAuthedWebSocket } from "@/shared/services/authedWebSocket";

type TabKey = "friends" | "requests" | "blocked";

const TAB_OPTIONS: { key: TabKey; label: string }[] = [
  { key: "friends", label: "My Crew" },
  { key: "requests", label: "Requests" },
  { key: "blocked", label: "Blocked" },
];


type PermitMappingEntry = { id: string; name: string };
const LOT_NAME_BY_ID = new Map<string, string>(
  Object.values(PERMIT_MAPPING as Record<string, PermitMappingEntry[]>)
    .flat()
    .map((entry) => [String(entry.id), entry.name]),
);

function resolveLotDisplayName(lotId: string | null | undefined): string {
  if (!lotId) return "Unknown lot";
  const lot = getLotById(lotId);
  if (lot?.shortName) return lot.shortName;
  if (lot?.name) return lot.name;
  return LOT_NAME_BY_ID.get(String(lotId)) ?? "Unknown lot";
}

export default function FriendsScreen() {
  const theme = useGlassTheme();
  const isDark = theme === GLASS_DARK;
  const router = useRouter();
  const { user, session } = useAuth();
  const isFocused = useIsFocused();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeTab, setActiveTab] = useState<TabKey>("friends");
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [friendEmail, setFriendEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data = { friends: [], requests: [], blocked: [] }, isRefetching } = useQuery({
    queryKey: ["friends_list", user?.id],
    queryFn: async () => {
      const res = await authApiCall("/friends");
      if (!res || res?._offline) return { friends: [], requests: [], blocked: [] };
      return {
        friends: res?.friends ?? [],
        requests: res?.requests ?? [],
        blocked: res?.blocked ?? [],
      };
    },
    enabled: !!session,
    // Fallback for builds where websocket is not connected yet.
    refetchInterval: isFocused ? 15000 : false,
  });

  const { friends, requests, blocked = [] } = data;

  useEffect(() => {
    if (!isFocused || !session) return;

    const disconnect = createAuthedWebSocket({
      endpoint: `${WEBSOCKET_BASE_URL}/ws/notifications`,
      onMessage: (payload) => {
        if (payload.type !== "notification") return;
        const details = payload.payload as Record<string, unknown> | undefined;
        if (details?.event !== "friend_request") return;

        queryClient.invalidateQueries({ queryKey: ["friends_list"] });
        Alert.alert("New Friend Request", "Someone just sent you a friend request.");
      },
    });

    return () => {
      disconnect();
    };
  }, [isFocused, session, queryClient]);

  const acceptMutation = useMutation({
    mutationFn: async (requestId: string) =>
      authApiCall("/friends/accept", {
        method: "POST",
        body: JSON.stringify({ request_id: requestId }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["friends_list"] }),
  });

  const declineMutation = useMutation({
    mutationFn: async (requestId: string) =>
      authApiCall("/friends/decline", {
        method: "POST",
        body: JSON.stringify({ request_id: requestId }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["friends_list"] }),
  });

  const blockMutation = useMutation({
    mutationFn: async (userId: string) =>
      authApiCall("/friends/block", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends_list"] });
      Alert.alert("Blocked", "User has been blocked.");
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async (userId: string) =>
      authApiCall("/friends/unblock", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends_list"] });
      Alert.alert("Unblocked", "User has been unblocked.");
    },
  });

  const sharingMutation = useMutation({
    mutationFn: async ({
      friendshipId,
      enabled,
    }: {
      friendshipId: string;
      enabled: boolean;
    }) =>
      authApiCall(`/friends/${friendshipId}/sharing`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["friends_list"] }),
  });

  const addFriendMutation = useMutation({
    mutationFn: async (email: string) =>
      authApiCall("/friends/request", {
        method: "POST",
        body: JSON.stringify({ friend_email: email.trim().toLowerCase() }),
      }),
    onSuccess: (res) => {
      if (res?.success) {
        Alert.alert("Sent!", "Friend request sent successfully.");
        queryClient.invalidateQueries({ queryKey: ["friends_list"] });
        setIsAddModalVisible(false);
        setFriendEmail("");
      } else if (res?.detail) {
        Alert.alert("Error", res.detail);
      }
    },
    onError: (err: any) =>
      Alert.alert("Error", err.message || "Could not send friend request."),
    onSettled: () => setIsSubmitting(false),
  });

  const handleAddFriend = () => {
    if (!friendEmail?.includes("@")) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }
    setIsSubmitting(true);
    addFriendMutation.mutate(friendEmail);
  };

  const handleFriendActions = (item: any) => {
    Alert.alert(item.name, "Choose an action", [
      { text: "Cancel", style: "cancel" },
      {
        text:
          item.sharing_enabled === false ? "Enable Sharing" : "Disable Sharing",
        onPress: () =>
          sharingMutation.mutate({
            friendshipId: item.id,
            enabled: item.sharing_enabled === false,
          }),
      },
      {
        text: "Block User",
        style: "destructive",
        onPress: () =>
          Alert.alert("Block User", `Block ${item.name}?`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Block",
              style: "destructive",
              onPress: () => blockMutation.mutate(item.friend_id),
            },
          ]),
      },
    ]);
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const tabOptions = TAB_OPTIONS.map((opt) => {
    if (opt.key === "requests")
      return { ...opt, badge: requests.length > 0 ? requests.length : undefined };
    if (opt.key === "blocked")
      return { ...opt, badge: blocked.length > 0 ? blocked.length : undefined };
    return opt;
  });

  const friendCountLabel =
    data === undefined ? "—" : `${friends.length} in your crew`;

  const renderFriend = ({ item }: { item: any }) => (
    <GlassCard
      style={styles.card}
      contentStyle={styles.cardContent}
      blurIntensity={theme.blurMedium}
    >
      <View style={[styles.avatarWrap, item.parked && styles.avatarWrapParked]}>
        <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
        {item.parked && <View style={styles.parkedBadge} />}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{item.name}</Text>
        <View style={styles.cardStatusRow}>
          {item.parked ? (
            <IconSymbol name="car.fill" size={11} color="#10b981" />
          ) : (
            <IconSymbol name="moon.fill" size={11} color={theme.textMuted} />
          )}
          <Text
            style={[styles.cardStatus, item.parked && styles.cardStatusParked]}
          >
            {item.parked
              ? `Parked at ${resolveLotDisplayName(item.lot_id)}`
              : item.status}
          </Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        {item.sharing_enabled === false && (
          <View style={styles.hiddenBadge}>
            <IconSymbol
              name="eye.slash.fill"
              size={12}
              color={theme.textMuted}
            />
          </View>
        )}
        {item.parked && item.lot_id && (
          <TouchableOpacity
            style={styles.locateBtn}
            onPress={() => {
              const lot = getLotById(item.lot_id);
              if (lot) {
                router.push({
                  pathname: "/(tabs)" as any,
                  params: { selectedLotId: lot.id },
                });
              }
            }}
          >
            <IconSymbol name="location.fill" size={14} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => handleFriendActions(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="ellipsis" size={16} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
    </GlassCard>
  );

  const renderRequest = ({ item }: { item: any }) => (
    <GlassCard
      style={styles.card}
      contentStyle={styles.cardContent}
      blurIntensity={theme.blurMedium}
    >
      <View style={styles.avatarWrap}>
        <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.cardStatus}>Wants to connect</Text>
      </View>
      <View style={styles.reqActions}>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => acceptMutation.mutate(item.id)}
        >
          <IconSymbol name="checkmark" size={15} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.declineBtn}
          onPress={() => declineMutation.mutate(item.id)}
        >
          <IconSymbol name="xmark" size={15} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    </GlassCard>
  );

  const renderBlocked = ({ item }: { item: any }) => (
    <GlassCard
      style={styles.card}
      contentStyle={styles.cardContent}
      blurIntensity={theme.blurMedium}
    >
      <View style={styles.avatarWrap}>
        <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{item.name}</Text>
        <View style={styles.cardStatusRow}>
          <IconSymbol name="nosign" size={11} color={theme.textMuted} />
          <Text style={styles.cardStatus}>Blocked</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.unblockBtn}
        onPress={() =>
          Alert.alert("Unblock User", `Unblock ${item.name}?`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Unblock",
              onPress: () => unblockMutation.mutate(item.friend_id),
            },
          ])
        }
      >
        <Text style={styles.unblockText}>Unblock</Text>
      </TouchableOpacity>
    </GlassCard>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme === GLASS_DARK ? "light-content" : "dark-content"} />
      <ScarletSpotsBackground />

      {/* ── List (rendered before glass header so blur works) ── */}
      <FlatList
        data={
          activeTab === "friends"
            ? friends
            : activeTab === "requests"
              ? requests
              : blocked
        }
        renderItem={
          activeTab === "friends"
            ? renderFriend
            : activeTab === "requests"
              ? renderRequest
              : renderBlocked
        }
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={isRefetching}
        onRefresh={() =>
          queryClient.invalidateQueries({ queryKey: ["friends_list"] })
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol
              name={
                activeTab === "friends"
                  ? "person.2.fill"
                  : activeTab === "requests"
                    ? "bell.fill"
                    : "nosign"
              }
              size={40}
              color={theme.textDim}
            />
            <Text style={styles.emptyTitle}>
              {activeTab === "friends"
                ? "No friends yet"
                : activeTab === "requests"
                  ? "No pending requests"
                  : "No blocked users"}
            </Text>
            <Text style={styles.emptySub}>
              {activeTab === "friends"
                ? "Tap + to add someone"
                : activeTab === "requests"
                  ? "You're all caught up"
                  : "You haven't blocked anyone"}
            </Text>
          </View>
        }
      />

      {/* ── Glass header (after content so blur reads list below) ── */}
      <View style={styles.headerContainer} pointerEvents="box-none">
        <LinearGradient
          colors={
            theme === GLASS_DARK
              ? ["rgba(15,15,18,0.98)", "rgba(15,15,18,0.85)", "transparent"]
              : ["rgba(245,245,247,0.98)", "rgba(245,245,247,0.85)", "transparent"]
          }
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.headerInner} pointerEvents="box-none">
          <View style={styles.headerRow} pointerEvents="box-none">
            <View pointerEvents="none">
              <Text style={styles.headerTitle}>Friends</Text>
              <Text style={styles.headerSub}>{friendCountLabel}</Text>
            </View>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setIsAddModalVisible(true)}
              activeOpacity={0.8}
            >
              <GlassBackground
                style={StyleSheet.absoluteFill}
                glassStyle="clear"
                blurIntensity={14}
              />
              <IconSymbol
                name="person.badge.plus"
                size={20}
                color={theme.accent}
              />
            </TouchableOpacity>
          </View>

          <GlassSegmentedControl
            options={tabOptions}
            value={activeTab}
            onChange={setActiveTab}
            variant="flat"
            style={styles.segmentedControl}
          />
        </View>
      </View>

      {/* ── Add Friend Modal ── */}
      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <View style={styles.modalOverlay}>
            <GlassBackground
              style={StyleSheet.absoluteFill}
              glassStyle="clear"
              preferLiquidGlass={false}
              blurIntensity={28}
              fallbackColor={isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.3)"}
            />
            <GlassCard
              style={styles.modalCard}
              contentStyle={styles.modalCardContent}
              blurIntensity={theme.blurMedium}
            >
              <View style={styles.modalIconRow}>
                <View style={styles.modalIcon}>
                  <IconSymbol
                    name="person.badge.plus"
                    size={22}
                    color={theme.accent}
                  />
                </View>
              </View>
              <Text style={styles.modalTitle}>Add Friend</Text>
              <Text style={styles.modalSub}>
                Enter their Rutgers email to send a request
              </Text>

              <TextInput
                style={styles.modalInput}
                placeholder="friend@scarletmail.rutgers.edu"
                placeholderTextColor={theme.textDim}
                autoCapitalize="none"
                keyboardType="email-address"
                value={friendEmail}
                onChangeText={setFriendEmail}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleAddFriend}
              />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => {
                    setIsAddModalVisible(false);
                    setFriendEmail("");
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSend,
                    (!friendEmail || isSubmitting) && styles.modalSendDisabled,
                  ]}
                  onPress={handleAddFriend}
                  disabled={isSubmitting || !friendEmail}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalSendText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const HEADER_HEIGHT = Platform.OS === "ios" ? 150 : 130;

function createStyles(theme: typeof GLASS_DARK) {
  const isDark = theme === GLASS_DARK;
  return StyleSheet.create({
    container: { flex: 1 },

    headerContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: HEADER_HEIGHT,
      zIndex: 10,
    },
    headerInner: {
      paddingTop: Platform.OS === "ios" ? 64 : 44,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: "800",
      color: theme.textPrimary,
      letterSpacing: -0.5,
    },
    headerSub: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
    addBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.borderColor,
      justifyContent: "center",
      alignItems: "center",
    },

    segmentedControl: {},

    listContent: {
      paddingTop: HEADER_HEIGHT + 52,
      paddingHorizontal: 16,
      paddingBottom: 120,
    },

    card: { marginBottom: 10 },
    cardContent: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    avatarWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: isDark ? "#1c1c1f" : "#e4e4e7",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: isDark ? "#2a2a2e" : "#d4d4d8",
    },
    avatarWrapParked: { borderColor: "rgba(16,185,129,0.5)" },
    avatarText: { color: theme.textSecondary, fontSize: 18, fontWeight: "700" },
    parkedBadge: {
      position: "absolute",
      bottom: 1,
      right: 1,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: "#10b981",
      borderWidth: 2,
      borderColor: isDark ? "#111113" : "#f5f5f7",
    },
    cardBody: { flex: 1 },
    cardName: { color: theme.textPrimary, fontSize: 15, fontWeight: "600" },
    cardStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 3,
    },
    cardStatus: { color: theme.textMuted, fontSize: 12 },
    cardStatusParked: { color: "#10b981" },
    cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    hiddenBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? "#24262c" : "#e4e4e7",
      justifyContent: "center",
      alignItems: "center",
    },
    locateBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(59,130,246,0.7)",
      justifyContent: "center",
      alignItems: "center",
    },
    menuBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      justifyContent: "center",
      alignItems: "center",
    },

    reqActions: { flexDirection: "row", gap: 8 },
    acceptBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#10b981",
      justifyContent: "center",
      alignItems: "center",
    },
    declineBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? "#1c1c1f" : "#e4e4e7",
      borderWidth: 1,
      borderColor: isDark ? "#2a2a2e" : "#d4d4d8",
      justifyContent: "center",
      alignItems: "center",
    },

    unblockBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: "rgba(220,38,38,0.12)",
      borderWidth: 1,
      borderColor: "rgba(220,38,38,0.25)",
      justifyContent: "center",
      alignItems: "center",
    },
    unblockText: {
      color: theme.accent,
      fontSize: 13,
      fontWeight: "600",
    },

    emptyState: { alignItems: "center", marginTop: 64, gap: 10 },
    emptyTitle: { color: theme.textMuted, fontSize: 17, fontWeight: "700" },
    emptySub: { color: theme.textDim, fontSize: 13 },

    modalOverlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      paddingBottom: 60,
    },
    modalCard: {
      width: "100%",
      maxWidth: 400,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.6,
      shadowRadius: 24,
      elevation: 12,
    },
    modalCardContent: { padding: 24 },
    modalIconRow: { alignItems: "center", marginBottom: 14 },
    modalIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.accentSubtle,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      justifyContent: "center",
      alignItems: "center",
    },
    modalTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 6,
    },
    modalSub: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: "center",
      marginBottom: 20,
    },
    modalInput: {
      backgroundColor: isDark ? "#0d0d0f" : "#ffffff",
      borderWidth: 1.5,
      borderColor: isDark ? "#27272a" : "#d4d4d8",
      borderRadius: 13,
      padding: 15,
      color: theme.textPrimary,
      fontSize: 15,
      marginBottom: 20,
    },
    modalBtns: { flexDirection: "row", gap: 10 },
    modalCancel: {
      flex: 1,
      height: 48,
      borderRadius: 13,
      backgroundColor: isDark ? "#1c1c1f" : "#e4e4e7",
      justifyContent: "center",
      alignItems: "center",
    },
    modalCancelText: { color: theme.textMuted, fontWeight: "600", fontSize: 15 },
    modalSend: {
      flex: 1,
      height: 48,
      borderRadius: 13,
      backgroundColor: theme.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    modalSendDisabled: { backgroundColor: isDark ? "#27272a" : "#d4d4d8" },
    modalSendText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
}
