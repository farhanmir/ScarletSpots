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
        },
        tabBarItemStyle: {
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 0 : 8,
        },
        tabBarBackground: () => (
          <View style={styles.tabBarBg}>
            <BlurView intensity={120} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
            <View style={styles.tabBarGlass} />
          </View>
        ),
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 28 : 14,
          left: 20,
          right: 20,
          height: Platform.OS === 'ios' ? 60 : 64,
          borderRadius: 32,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
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
            <IconSymbol size={focused ? 24 : 22} name="magnifyingglass" color={color} />
          ),
        }}
      />

      {/* Map (Center) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeTab : undefined}>
              <IconSymbol size={focused ? 24 : 22} name="map.fill" color={focused ? '#fff' : color} />
            </View>
          ),
        }}
      />

      {/* Navigate / Compass (Right) */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Navigate',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 24 : 22} name="location.north.fill" color={color} />
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
  activeTab: {
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
    borderRadius: 14,
    padding: 6,
    marginTop: -2,
  },
});
