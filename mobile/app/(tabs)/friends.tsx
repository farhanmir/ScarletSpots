import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BlurView } from 'expo-blur';
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

  // Fetch Friends and Requests
  const { data = { friends: [], requests: [] }, isRefetching } = useQuery({
    queryKey: ['friends_list'],
    queryFn: async () => {
      const res = await authApiCall('/friends');
      if (res?._offline) {
        return { friends: [], requests: [] };
      }
      return { friends: res?.friends ?? [], requests: res?.requests ?? [] };
    },
    // Poll every 60s while focused for friend parking status updates
    // (parking_sessions are RLS-gated so Realtime can't deliver them here)
    refetchInterval: isFocused ? 60000 : false,
  });

  // ── Realtime: friendships table ──────────────────────────────────────────
  // Two channels so each subscription is filtered precisely via RLS:
  //   1. Rows where I am the initiator (user_id) — outbound request status changes
  //   2. Rows where I am the target (friend_id)  — incoming requests & acceptance
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
      supabase.removeChannel(outbound);
      supabase.removeChannel(inbound);
    };
  }, [isFocused, user?.id, queryClient]);

  const { friends, requests } = data;

  const acceptMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return await authApiCall('/friends/accept', { method: 'POST', body: JSON.stringify({ request_id: requestId }) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends_list'] }),
  });

  const declineMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return await authApiCall('/friends/decline', { method: 'POST', body: JSON.stringify({ request_id: requestId }) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends_list'] }),
  });

  const blockMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await authApiCall('/friends/block', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends_list'] });
      Alert.alert('Blocked', 'User has been blocked.');
    },
  });

  const sharingMutation = useMutation({
    mutationFn: async ({ friendshipId, enabled }: { friendshipId: string; enabled: boolean }) => {
      return await authApiCall(`/friends/${friendshipId}/sharing`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends_list'] }),
  });

  const addFriendMutation = useMutation({
    mutationFn: async (email: string) => {
      return await authApiCall('/friends/request', { 
        method: 'POST', 
        body: JSON.stringify({ friend_email: email.trim().toLowerCase() }) 
      });
    },
    onSuccess: (res) => {
      if (res?.success) {
        Alert.alert('Success', 'Friend request sent!');
        queryClient.invalidateQueries({ queryKey: ['friends_list'] });
        setIsAddModalVisible(false);
        setFriendEmail('');
      } else if (res?.detail) {
        Alert.alert('Error', res.detail);
      }
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Could not send friend request.");
    },
    onSettled: () => setIsSubmitting(false),
  });

  const handleAddFriend = () => {
    if (!friendEmail || !friendEmail.includes('@')) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }
    setIsSubmitting(true);
    addFriendMutation.mutate(friendEmail);
  };

  const handleFriendActions = (item: any) => {
    Alert.alert(
      item.name,
      'Choose an action',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: item.sharing_enabled === false ? 'Enable Sharing' : 'Disable Sharing',
          onPress: () => sharingMutation.mutate({
            friendshipId: item.id,
            enabled: item.sharing_enabled === false,
          }),
        },
        {
          text: 'Block User',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Block User', `Are you sure you want to block ${item.name}?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Block', style: 'destructive', onPress: () => blockMutation.mutate(item.friend_id) },
            ]);
          },
        },
      ]
    );
  };

  const renderFriend = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.friendItem}
      activeOpacity={0.7}
      onLongPress={() => handleFriendActions(item)}
    >
      <View style={styles.avatarContainer}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
        </View>
        {item.parked && <View style={styles.onlineBadge} />}
      </View>

      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.name}</Text>
        <Text style={[styles.friendStatus, item.parked && styles.statusParked]}>
          {item.status}
        </Text>
      </View>

      {/* Sharing indicator */}
      {item.sharing_enabled === false && (
        <View style={styles.sharingBadge}>
          <IconSymbol name="eye.slash.fill" size={14} color="#71717a" />
        </View>
      )}

      {item.parked && item.lot_id && (
        <TouchableOpacity
          style={styles.locateButton}
          onPress={() => {
            const lot = getLotById(item.lot_id);
            if (lot) {
              router.push({
                pathname: '/(tabs)',
                params: { selectedLotId: lot.id },
              });
            }
          }}
        >
          <IconSymbol name="location.fill" size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderRequest = ({ item }: { item: any }) => (
    <View style={styles.friendItem}>
      <View style={styles.avatarContainer}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
        </View>
      </View>
      
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.name}</Text>
        <Text style={styles.friendStatus}>Wants to share location</Text>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={() => acceptMutation.mutate(item.id)}>
          <IconSymbol name="checkmark" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.declineButton]} onPress={() => declineMutation.mutate(item.id)}>
          <IconSymbol name="xmark" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#09090b', '#18181b']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Friends</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsAddModalVisible(true)}>
          <IconSymbol name="person.badge.plus" size={24} color="#dc2626" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
            My Crew
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
          onPress={() => setActiveTab('requests')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
              Requests
            </Text>
            {requests.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{requests.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={activeTab === 'friends' ? friends : requests}
        renderItem={activeTab === 'friends' ? renderFriend : renderRequest}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={isRefetching}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['friends_list'] })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name="person.2.slash" size={48} color="#3f3f46" />
            <Text style={styles.emptyText}>
              {activeTab === 'friends' ? "No friends yet." : "No pending requests."}
            </Text>
          </View>
        }
      />
      {/* Add Friend Modal */}
      <Modal
        visible={isAddModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Friend</Text>
            <Text style={styles.modalSubtitle}>Enter your friend&apos;s email address to send a request.</Text>
            
            <TextInput
              style={styles.input}
              placeholder="friend@example.com"
              placeholderTextColor="#71717a"
              autoCapitalize="none"
              keyboardType="email-address"
              value={friendEmail}
              onChangeText={setFriendEmail}
              autoFocus={true}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setIsAddModalVisible(false);
                  setFriendEmail('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAddFriend}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 20,
  },
  tab: {
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#dc2626',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#71717a',
  },
  activeTabText: {
    color: '#fff',
  },
  badge: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(39, 39, 42, 0.4)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  avatarText: {
    color: '#a1a1aa',
    fontSize: 20,
    fontWeight: '600',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#18181b',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  friendStatus: {
    color: '#71717a',
    fontSize: 13,
  },
  statusParked: {
    color: '#10b981',
  },
  locateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(39, 39, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  sharingBadge: {
    marginRight: 8,
    opacity: 0.7,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  declineButton: {
    backgroundColor: '#3f3f46',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    opacity: 0.5,
  },
  emptyText: {
    color: '#71717a',
    marginTop: 16,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#18181b',
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#27272a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#a1a1aa',
    fontSize: 14,
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#27272a',
  },
  confirmButton: {
    backgroundColor: '#dc2626',
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
