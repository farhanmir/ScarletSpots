import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BlurView } from 'expo-blur';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#ff3b3b',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.35)',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
          marginBottom: Platform.OS === 'android' ? 6 : 0,
        },
        tabBarItemStyle: {
          paddingTop: 10,
        },
        tabBarBackground: () => (
          <View style={styles.tabBarBg}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={120} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
            ) : null}
            <View style={[
              styles.tabBarGlass,
              Platform.OS === 'android' && styles.tabBarGlassAndroid,
            ]} />
          </View>
        ),
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 28 : 16,
          left: 16,
          right: 16,
          height: 62,
          borderRadius: 32,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
          paddingBottom: 0,
          overflow: 'hidden',
        },
      }}>

      {/* Search (Left) */}
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 22 : 20} name="magnifyingglass" color={color} />
          ),
        }}
      />

      {/* Map (Center-Left) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeTab : undefined}>
              <IconSymbol size={focused ? 22 : 20} name="map.fill" color={focused ? '#fff' : color} />
            </View>
          ),
        }}
      />

      {/* Navigate Compass — Visual only, NOT tappable */}
      <Tabs.Screen
        name="navigate"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={styles.needleContainer}>
              <IconSymbol name="location.north.fill" size={16} color="rgba(255,255,255,0.18)" />
            </View>
          ),
          tabBarButton: (props) => (
            <View
              style={styles.disabledTab}
              pointerEvents="none"
            >
              <View style={styles.needleContainer}>
                <IconSymbol name="location.north.fill" size={16} color="rgba(255,255,255,0.18)" />
              </View>
            </View>
          ),
        }}
      />

      {/* Profile (Right) */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 22 : 20} name="person.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    overflow: 'hidden',
  },
  tabBarGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.55)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 32,
  },
  tabBarGlassAndroid: {
    // Android doesn't have BlurView, so use a fully opaque dark bg
    backgroundColor: '#0a0a0a',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  activeTab: {
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
    borderRadius: 12,
    padding: 5,
  },
  disabledTab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  needleContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
