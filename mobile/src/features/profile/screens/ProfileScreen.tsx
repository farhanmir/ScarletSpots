import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/shared/components/ui/icon-symbol';
import { authApiCall } from '@/shared/api/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { getLotById, type RutgersLot, NB_CAMPUS_NAMES } from '@/shared/constants/lots';
import { fetchWithOfflineFallback, cacheFavorites } from '@/shared/services/OfflineCache';
import { GlassBackground } from '@/shared/components/ui/GlassBackground';

export default function ProfileScreen() {
  const { session, user, loading, signOut, permitType, secondaryPermitType, noPermitMode, enabledCampuses, toggleCampus } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState<RutgersLot[]>([]);
  const [showCampuses, setShowCampuses] = useState(false);

  const fetchFavorites = React.useCallback(async () => {
    if (!session) return;
    try {
      const { data: ids } = await fetchWithOfflineFallback(
        async () => {
          const resp = await authApiCall('/favorites');
          const lotIds = (resp?.favorite_lots as { lot_id: string }[]).map((item) => item.lot_id);
          await cacheFavorites(lotIds);
          return lotIds;
        },
        'favorites_cache',
        1000 * 60 * 5,
      );
      const lots = ids
        .map((id: string) => getLotById(id))
        .filter((lot): lot is RutgersLot => lot !== undefined);
      setFavorites(lots);
    } catch (e) {
      console.error('Failed to fetch favorites:', e);
    }
  }, [session]);

  useFocusEffect(
    React.useCallback(() => {
      if (session) fetchFavorites();
    }, [session, fetchFavorites])
  );

  if (!loading && !session) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0f0f12', '#09090b']} style={StyleSheet.absoluteFill} />
        <View style={styles.centerContent}>
          <View style={styles.notSignedInIcon}>
            <IconSymbol name="person.fill" size={36} color="#3f3f46" />
          </View>
          <Text style={styles.notLoggedInText}>Not signed in</Text>
          <Text style={styles.notLoggedInSub}>Sign in to view your profile</Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/auth/login' as any)}>
            <Text style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const initials = user?.email?.charAt(0).toUpperCase() || '?';

  const permitLabel = !permitType
    ? 'Not configured'
    : noPermitMode === 'all'
      ? 'Show all lots'
      : noPermitMode === 'commuter_all'
        ? 'All commuter lots'
        : permitType;

  const secondaryLabel = secondaryPermitType ? `+ ${secondaryPermitType}` : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0f0f12', '#09090b']} style={StyleSheet.absoluteFill} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ── */}
        <View style={styles.heroCard}>
          <GlassBackground
            style={StyleSheet.absoluteFill}
            glassStyle="regular"
            blurIntensity={22}
            blurTint="dark"
            fallbackColor="rgba(9,9,11,0.9)"
          />
          <View style={styles.heroInner}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
              <View style={styles.avatarRing} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroEmail} numberOfLines={1}>{user?.email}</Text>
              <Text style={styles.heroSince}>
                Member since {new Date(user?.created_at || '').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Permit row ── */}
        <TouchableOpacity
          style={styles.permitRow}
          onPress={() => router.push('/onboarding/permit?fromProfile=true' as any)}
          activeOpacity={0.75}
        >
          <GlassBackground
            style={StyleSheet.absoluteFill}
            glassStyle="regular"
            blurIntensity={18}
            blurTint="dark"
            fallbackColor="rgba(9,9,11,0.9)"
          />
          <View style={styles.permitIconWrap}>
            <IconSymbol name="parkingsign.circle.fill" size={22} color="#dc2626" />
          </View>
          <View style={styles.permitText}>
            <Text style={styles.permitRowLabel}>Parking Permit</Text>
            <Text style={styles.permitRowValue} numberOfLines={1}>{permitLabel}</Text>
            {secondaryLabel && (
              <Text style={styles.permitRowSecondary} numberOfLines={1}>{secondaryLabel}</Text>
            )}
          </View>
          <IconSymbol name="chevron.right" size={14} color="#3f3f46" />
        </TouchableOpacity>

        {/* ── Favorites ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="star.fill" size={15} color="#f59e0b" />
            <Text style={styles.sectionTitle}>Saved Lots</Text>
            <Text style={styles.sectionCount}>{favorites.length}</Text>
          </View>

          {favorites.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol name="star" size={28} color="#27272a" />
              <Text style={styles.emptyText}>No saved lots yet</Text>
              <Text style={styles.emptySubtext}>Long-press any lot on the map to save it</Text>
            </View>
          ) : (
            favorites.map((lot, i) => (
              <TouchableOpacity
                key={lot.id}
                style={[styles.favRow, i === favorites.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => router.push({ pathname: '/' as any, params: { selectedLotId: lot.id } })}
                activeOpacity={0.75}
              >
                <View style={styles.favIcon}>
                  <IconSymbol name="car.fill" size={14} color="#f59e0b" />
                </View>
                <View style={styles.favText}>
                  <Text style={styles.favName}>{lot.name}</Text>
                  <Text style={styles.favSub}>{lot.campus} Campus</Text>
                </View>
                <IconSymbol name="chevron.right" size={13} color="#3f3f46" />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* ── Settings ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="gearshape.fill" size={15} color="#71717a" />
            <Text style={styles.sectionTitle}>Settings</Text>
          </View>

          {/* Campus filter (collapsible) */}
          <TouchableOpacity style={styles.settingRow} onPress={() => setShowCampuses(prev => !prev)} activeOpacity={0.75}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                <IconSymbol name="building.2.fill" size={14} color="#4ade80" />
              </View>
              <View>
                <Text style={styles.settingLabel}>Campus Filter</Text>
                <Text style={styles.settingSubtext}>{enabledCampuses.size} of {NB_CAMPUS_NAMES.length} campuses</Text>
              </View>
            </View>
            <IconSymbol name={showCampuses ? 'chevron.down' : 'chevron.right'} size={13} color="#3f3f46" />
          </TouchableOpacity>

          {showCampuses && NB_CAMPUS_NAMES.map((campus) => {
            const enabled = enabledCampuses.has(campus);
            return (
              <TouchableOpacity
                key={campus}
                style={styles.campusRow}
                onPress={() => toggleCampus(campus)}
                activeOpacity={0.75}
              >
                <View style={styles.campusLeft}>
                  <View style={[styles.campusDot, { backgroundColor: enabled ? '#4ade80' : '#27272a' }]} />
                  <Text style={[styles.campusName, !enabled && { color: '#52525b' }]}>{campus}</Text>
                </View>
                <View style={[styles.campusToggle, enabled && styles.campusToggleActive]}>
                  <View style={[styles.campusToggleThumb, enabled && styles.campusToggleThumbActive]} />
                </View>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.75}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
                <IconSymbol name="bell.fill" size={14} color="#3b82f6" />
              </View>
              <View>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={styles.settingSubtext}>Session alerts & reminders</Text>
              </View>
            </View>
            <IconSymbol name="chevron.right" size={13} color="#3f3f46" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingRow, { borderBottomWidth: 0 }]} activeOpacity={0.75}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <IconSymbol name="trash.fill" size={14} color="#ef4444" />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: '#ef4444' }]}>Delete Account</Text>
                <Text style={styles.settingSubtext}>Permanently remove all data</Text>
              </View>
            </View>
            <IconSymbol name="chevron.right" size={13} color="#3f3f46" />
          </TouchableOpacity>
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity style={styles.signOutButton} onPress={signOut} activeOpacity={0.8}>
          <IconSymbol name="rectangle.portrait.and.arrow.right" size={17} color="#dc2626" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 72 : 52,
    paddingHorizontal: 16,
  },

  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  notSignedInIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#18181b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  notLoggedInText: { color: '#e4e4e7', fontSize: 18, fontWeight: '700' },
  notLoggedInSub: { color: '#52525b', fontSize: 14 },
  loginButton: {
    marginTop: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 13,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  loginButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Hero card
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1f1f23',
    marginBottom: 12,
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 16,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(220,38,38,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarRing: {
    position: 'absolute',
    inset: 0,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'rgba(220,38,38,0.35)',
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#dc2626' },
  heroText: { flex: 1 },
  heroEmail: { color: '#f4f4f5', fontSize: 15, fontWeight: '600' },
  heroSince: { color: '#52525b', fontSize: 12, marginTop: 3 },

  // Permit row
  permitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1f1f23',
    padding: 14,
    gap: 12,
    marginBottom: 12,
  },
  permitIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(220,38,38,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permitText: { flex: 1, justifyContent: 'center' },
  permitRowLabel: { color: '#a1a1aa', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  permitRowValue: { color: '#f4f4f5', fontSize: 14, fontWeight: '600', marginTop: 2 },
  permitRowSecondary: { color: '#a1a1aa', fontSize: 12, marginTop: 2 },

  // Section
  section: {
    backgroundColor: '#111113',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1f1f23',
    padding: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: { color: '#d4d4d8', fontSize: 14, fontWeight: '700', flex: 1 },
  sectionCount: {
    color: '#52525b',
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { color: '#52525b', fontSize: 14, fontWeight: '600' },
  emptySubtext: { color: '#3f3f46', fontSize: 12, textAlign: 'center' },

  // Favorites
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1e',
    gap: 12,
  },
  favIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(245,158,11,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  favText: { flex: 1 },
  favName: { color: '#e4e4e7', fontSize: 14, fontWeight: '500' },
  favSub: { color: '#52525b', fontSize: 12, marginTop: 1 },

  // Settings
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1e',
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingLabel: { color: '#d4d4d8', fontSize: 14, fontWeight: '500' },
  settingSubtext: { color: '#52525b', fontSize: 12, marginTop: 1 },

  // Sign out
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
    backgroundColor: 'rgba(220,38,38,0.06)',
    marginBottom: 8,
  },
  signOutText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },

  // Campus filter
  campusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1e',
  },
  campusLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  campusDot: { width: 8, height: 8, borderRadius: 4 },
  campusName: { color: '#e4e4e7', fontSize: 14, fontWeight: '500' },
  campusToggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  campusToggleActive: { backgroundColor: 'rgba(34,197,94,0.3)' },
  campusToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#52525b',
  },
  campusToggleThumbActive: {
    backgroundColor: '#4ade80',
    alignSelf: 'flex-end',
  },
});
