import React, { useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BlurView } from 'expo-blur';

// Mock Data for now
const MOCK_FRIENDS = [
  { id: '1', name: 'Sarah J.', status: 'Parked at Lot 54', parked: true, avatar: null },
  { id: '2', name: 'Mike T.', status: 'Last seen 2h ago', parked: false, avatar: null },
];

const MOCK_REQUESTS = [
  { id: '3', name: 'David R.', status: 'Incoming Request', avatar: null },
];

export default function FriendsScreen() {
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');

  const renderFriend = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.friendItem} activeOpacity={0.7}>
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

      {item.parked && (
        <TouchableOpacity style={styles.locateButton}>
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
        <TouchableOpacity style={[styles.actionButton, styles.acceptButton]}>
          <IconSymbol name="checkmark" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.declineButton]}>
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
        <TouchableOpacity style={styles.addButton}>
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
            {MOCK_REQUESTS.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{MOCK_REQUESTS.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={activeTab === 'friends' ? MOCK_FRIENDS : MOCK_REQUESTS}
        renderItem={activeTab === 'friends' ? renderFriend : renderRequest}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name="person.2.slash" size={48} color="#3f3f46" />
            <Text style={styles.emptyText}>
              {activeTab === 'friends' ? "No friends yet." : "No pending requests."}
            </Text>
          </View>
        }
      />
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
});
