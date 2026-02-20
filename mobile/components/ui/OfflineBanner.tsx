import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();

  // Show banner if we explicitly know we are disconnected
  // (ignore the initial null/loading state to avoid flashing)
  if (netInfo.isConnected === null || netInfo.isConnected === true) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.banner}>
        <Ionicons name="cloud-offline" size={16} color="#fff" />
        <Text style={styles.text}>No internet connection. Using offline mode.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#dc2626', // Red-600
    width: '100%',
    zIndex: 999, // Ensure it sits on top of navigation headers
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});
