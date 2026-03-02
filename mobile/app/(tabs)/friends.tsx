import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApiCall, supabase } from '../../lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { getLotById } from '../../data/lots';

export default function FriendsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data = { friends: [], requests: [] }, isRefetching } = useQuery({
    queryKey: ['friends_list', user?.id],
    queryFn: async () => {
      const res = await authApiCall('/friends');
      if (!res || res?._offline) return { friends: [], requests: [] };
      return { friends: res?.friends ?? [], requests: res?.requests ?? [] };
    },
    enabled: !!user?.id,
    refetchInterval: isFocused ? 60000 : false,
  });

  useEffect(() => {
    if (!isFocused || !user?.id) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['friends_list'] });
    const outbound = supabase
      .channel('friendships-outbound')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `user_id=eq.${user.id}` }, invalidate)
      .subscribe();
    const inbound = supabase
      .channel('friendships-inbound')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${user.id}` }, invalidate)
      .subscribe();
    return () => {
      outbound.unsubscribe();
      inbound.unsubscribe();
      supabase.removeChannel(outbound);
      supabase.removeChannel(inbound);
    };
  }, [isFocused, user?.id, queryClient]);

  const { friends, requests } = data;

  const acceptMutation = useMutation({
    mutationFn: async (requestId: string) =>
      authApiCall('/friends/accept', { method: 'POST', body: JSON.stringify({ request_id: requestId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends_list'] }),
  });

  const declineMutation = useMutation({
    mutationFn: async (requestId: string) =>
      authApiCall('/friends/decline', { method: 'POST', body: JSON.stringify({ request_id: requestId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends_list'] }),
  });

  const blockMutation = useMutation({
    mutationFn: async (userId: string) =>
      authApiCall('/friends/block', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends_list'] });
      Alert.alert('Blocked', 'User has been blocked.');
    },
  });

  const sharingMutation = useMutation({
    mutationFn: async ({ friendshipId, enabled }: { friendshipId: string; enabled: boolean }) =>
      authApiCall(`/friends/${friendshipId}/sharing`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends_list'] }),
  });

  const addFriendMutation = useMutation({
    mutationFn: async (email: string) =>
      authApiCall('/friends/request', { method: 'POST', body: JSON.stringify({ friend_email: email.trim().toLowerCase() }) }),
    onSuccess: (res) => {
      if (res?.success) {
        Alert.alert('Sent!', 'Friend request sent successfully.');
        queryClient.invalidateQueries({ queryKey: ['friends_list'] });
        setIsAddModalVisible(false);
        setFriendEmail('');
      } else if (res?.detail) {
        Alert.alert('Error', res.detail);
      }
    },
    onError: (err: any) => Alert.alert('Error', err.message || 'Could not send friend request.'),
    onSettled: () => setIsSubmitting(false),
  });

  const handleAddFriend = () => {
    if (!friendEmail || !friendEmail.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }
    setIsSubmitting(true);
    addFriendMutation.mutate(friendEmail);
  };

  const handleFriendActions = (item: any) => {
    Alert.alert(item.name, 'Choose an action', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: item.sharing_enabled === false ? 'Enable Sharing' : 'Disable Sharing',
        onPress: () => sharingMutation.mutate({ friendshipId: item.id, enabled: item.sharing_enabled === false }),
      },
      {
        text: 'Block User',
        style: 'destructive',
        onPress: () => Alert.alert('Block User', `Block ${item.name}?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Block', style: 'destructive', onPress: () => blockMutation.mutate(item.friend_id) },
        ]),
      },
    ]);
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const renderFriend = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onLongPress={() => handleFriendActions(item)}
    >
      <View style={[styles.avatarWrap, item.parked && styles.avatarWrapParked]}>
        <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
        {item.parked && <View style={styles.parkedBadge} />}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{item.name}</Text>
        <View style={styles.cardStatusRow}>
          {item.parked
            ? <IconSymbol name="car.fill" size={11} color="#10b981" />
            : <IconSymbol name="moon.fill" size={11} color="#52525b" />}
          <Text style={[styles.cardStatus, item.parked && styles.cardStatusParked]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        {item.sharing_enabled === false && (
          <View style={styles.hiddenBadge}>
            <IconSymbol name="eye.slash.fill" size={12} color="#52525b" />
          </View>
        )}
        {item.parked && item.lot_id && (
          <TouchableOpacity
            style={styles.locateBtn}
            onPress={() => {
              const lot = getLotById(item.lot_id);
              if (lot) router.push({ pathname: '/(tabs)', params: { selectedLotId: lot.id } });
            }}
          >
            <IconSymbol name="location.fill" size={14} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderRequest = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.avatarWrap}>
        <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.cardStatus}>Wants to connect</Text>
      </View>
      <View style={styles.reqActions}>
        <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptMutation.mutate(item.id)}>
          <IconSymbol name="checkmark" size={15} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineBtn} onPress={() => declineMutation.mutate(item.id)}>
          <IconSymbol name="xmark" size={15} color="#a1a1aa" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0f0f12', '#09090b']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Friends</Text>
          <Text style={styles.headerSub}>{friends.length} in your crew</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setIsAddModalVisible(true)} activeOpacity={0.8}>
          <IconSymbol name="person.badge.plus" size={20} color="#dc2626" />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['friends', 'requests'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab === 'friends' ? 'My Crew' : 'Requests'}
            </Text>
            {tab === 'requests' && requests.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{requests.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={activeTab === 'friends' ? friends : requests}
        renderItem={activeTab === 'friends' ? renderFriend : renderRequest}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={isRefetching}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['friends_list'] })}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name={activeTab === 'friends' ? 'person.2.fill' : 'bell.fill'} size={40} color="#27272a" />
            <Text style={styles.emptyTitle}>
              {activeTab === 'friends' ? 'No friends yet' : 'No pending requests'}
            </Text>
            <Text style={styles.emptySub}>
              {activeTab === 'friends' ? 'Tap + to add someone' : "You're all caught up"}
            </Text>
          </View>
        }
      />

      {/* Add Friend Modal */}
      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={styles.modalOverlay}>
            <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.modalCard}>
              <View style={styles.modalIconRow}>
                <View style={styles.modalIcon}>
                  <IconSymbol name="person.badge.plus" size={22} color="#dc2626" />
                </View>
              </View>
              <Text style={styles.modalTitle}>Add Friend</Text>
              <Text style={styles.modalSub}>Enter their Rutgers email to send a request</Text>

              <TextInput
                style={styles.modalInput}
                placeholder="friend@scarletmail.rutgers.edu"
                placeholderTextColor="#3f3f46"
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
                  onPress={() => { setIsAddModalVisible(false); setFriendEmail(''); }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSend, (!friendEmail || isSubmitting) && styles.modalSendDisabled]}
                  onPress={handleAddFriend}
                  disabled={isSubmitting || !friendEmail}
                >
                  {isSubmitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.modalSendText}>Send</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 64 : 44,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#fafafa', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#52525b', marginTop: 2 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#111113',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1f1f23',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 6,
  },
  tabItemActive: { backgroundColor: '#1c1c1f' },
  tabLabel: { fontSize: 14, fontWeight: '600', color: '#52525b' },
  tabLabelActive: { color: '#f4f4f5' },
  tabBadge: {
    backgroundColor: '#dc2626',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111113',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f1f23',
    gap: 12,
  },
  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1c1c1f',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2a2a2e',
  },
  avatarWrapParked: { borderColor: 'rgba(16,185,129,0.5)' },
  avatarText: { color: '#a1a1aa', fontSize: 18, fontWeight: '700' },
  parkedBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#111113',
  },
  cardBody: { flex: 1 },
  cardName: { color: '#f4f4f5', fontSize: 15, fontWeight: '600' },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardStatus: { color: '#52525b', fontSize: 12 },
  cardStatusParked: { color: '#10b981' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hiddenBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#1c1c1f',
    justifyContent: 'center', alignItems: 'center',
  },
  locateBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#dc2626',
    justifyContent: 'center', alignItems: 'center',
  },

  // Request actions
  reqActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#10b981',
    justifyContent: 'center', alignItems: 'center',
  },
  declineBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1c1c1f',
    borderWidth: 1, borderColor: '#2a2a2e',
    justifyContent: 'center', alignItems: 'center',
  },

  // Empty
  emptyState: { alignItems: 'center', marginTop: 64, gap: 10 },
  emptyTitle: { color: '#3f3f46', fontSize: 17, fontWeight: '700' },
  emptySub: { color: '#27272a', fontSize: 13 },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 60,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#111113',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1f1f23',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  modalIconRow: { alignItems: 'center', marginBottom: 14 },
  modalIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalTitle: { color: '#fafafa', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  modalSub: { color: '#52525b', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  modalInput: {
    backgroundColor: '#0d0d0f',
    borderWidth: 1.5, borderColor: '#27272a',
    borderRadius: 13,
    padding: 15,
    color: '#f4f4f5',
    fontSize: 15,
    marginBottom: 20,
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1, height: 48, borderRadius: 13,
    backgroundColor: '#1c1c1f',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCancelText: { color: '#71717a', fontWeight: '600', fontSize: 15 },
  modalSend: {
    flex: 1, height: 48, borderRadius: 13,
    backgroundColor: '#dc2626',
    justifyContent: 'center', alignItems: 'center',
  },
  modalSendDisabled: { backgroundColor: '#27272a' },
  modalSendText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
