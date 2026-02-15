import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { useAuth } from '@/context/AuthProvider';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function ProfileScreen() {
  const { session, user, loading, signOut } = useAuth();
  const router = useRouter();
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);

  if (!loading && !session) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <IconSymbol name="person.fill" size={60} color="#333" />
          <Text style={styles.notLoggedInText}>Not signed in</Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/auth/login')}>
            <Text style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const initials = user?.email?.charAt(0).toUpperCase() || '?';

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header / Avatar */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.memberSince}>
            Member since {new Date(user?.created_at || '').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </Text>
        </View>

        {/* Favorite Locations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="star.fill" size={18} color="#f59e0b" />
            <Text style={styles.sectionTitle}>Favorite Locations</Text>
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No favorites yet</Text>
            <Text style={styles.emptySubtext}>
              Long-press a lot on the map to save it here
            </Text>
          </View>
        </View>

        {/* Friends */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="person.2.fill" size={18} color="#3b82f6" />
            <Text style={styles.sectionTitle}>Friends</Text>
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No friends added</Text>
            <Text style={styles.emptySubtext}>
              Share your parking status with friends
            </Text>
          </View>
          <TouchableOpacity style={styles.actionButton}>
            <IconSymbol name="person.badge.plus" size={16} color="#3b82f6" />
            <Text style={styles.actionButtonText}>Add Friends</Text>
          </TouchableOpacity>
        </View>

        {/* History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="clock.fill" size={18} color="#a1a1aa" />
            <Text style={styles.sectionTitle}>History</Text>
          </View>
          {/* Mock History Item */}
          <View style={styles.historyItem}>
            <View style={styles.historyLeft}>
              <Text style={styles.historyLot}>College Ave Deck</Text>
              <Text style={styles.historyDate}>Yesterday, 2 hrs</Text>
            </View>
            {/* Free */}
          </View>
          <View style={styles.historyItem}>
            <View style={styles.historyLeft}>
              <Text style={styles.historyLot}>Yellow Lot</Text>
              <Text style={styles.historyDate}>Feb 12, 4 hrs</Text>
            </View>
             {/* Free */}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="gearshape.fill" size={18} color="#a1a1aa" />
            <Text style={styles.sectionTitle}>Settings</Text>
          </View>

          {/* Heatmap Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Heatmap Overlay</Text>
              <Text style={styles.settingSubtext}>Show lot density on map</Text>
            </View>
            <Switch
              value={heatmapEnabled}
              onValueChange={setHeatmapEnabled}
              trackColor={{ false: '#27272a', true: 'rgba(220, 38, 38, 0.5)' }}
              thumbColor={heatmapEnabled ? '#dc2626' : '#52525b'}
              ios_backgroundColor="#27272a"
            />
          </View>

          {/* Notifications */}
          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Text style={styles.settingSubtext}>Session alerts & reminders</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color="#52525b" />
          </TouchableOpacity>

          {/* Vehicles */}
          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>My Vehicles</Text>
              <Text style={styles.settingSubtext}>Manage license plates</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color="#52525b" />
          </TouchableOpacity>

          {/* Delete Account */}
          <TouchableOpacity style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: '#ef4444' }]}>Delete Account</Text>
              <Text style={styles.settingSubtext}>Permanently remove all data</Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color="#52525b" />
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Extra padding for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  notLoggedInText: {
    color: '#52525b',
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  loginButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 80 : 50,
    paddingHorizontal: 20,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#18181b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#dc2626',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#dc2626',
  },
  email: {
    color: '#e4e4e7',
    fontSize: 16,
    fontWeight: '600',
  },
  memberSince: {
    color: '#52525b',
    fontSize: 12,
    marginTop: 4,
  },

  // Sections
  section: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#e4e4e7',
    fontSize: 15,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyText: {
    color: '#52525b',
    fontSize: 14,
    fontWeight: '500',
  },
  emptySubtext: {
    color: '#3f3f46',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },

  // Action button
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  actionButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },

  // Settings
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    color: '#d4d4d8',
    fontSize: 14,
    fontWeight: '500',
  },
  settingSubtext: {
    color: '#52525b',
    fontSize: 12,
    marginTop: 2,
  },

  // Sign out
  signOutButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    marginTop: 8,
  },
  signOutText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  historyLeft: {
    gap: 2,
  },
  historyLot: {
    color: '#e4e4e7',
    fontSize: 14,
    fontWeight: '500',
  },
  historyDate: {
    color: '#71717a',
    fontSize: 12,
  },
  historyPrice: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
