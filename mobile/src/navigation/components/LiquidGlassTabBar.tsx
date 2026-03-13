import React, { useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/shared/components/ui/icon-symbol';
import { GlassBackground } from '@/shared/components/ui/GlassBackground';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const { width } = Dimensions.get('window');
const TAB_BAR_WIDTH = width - 32;
const TAB_BAR_HEIGHT = 62;

const TAB_CONFIG: Record<string, { icon: string; label: string }> = {
  index:    { icon: 'map.fill',            label: 'Map' },
  search:   { icon: 'magnifyingglass',     label: 'Search' },
  friends:  { icon: 'person.2.fill',       label: 'Friends' },
  profile:  { icon: 'person.fill',         label: 'Profile' },
};

export default function LiquidGlassTabBar({
  state,
  navigation,
}: Readonly<BottomTabBarProps>) {
  const routes = state.routes;
  const tabWidth = TAB_BAR_WIDTH / routes.length;
  const activeIndex = state.index;

  const PILL_WIDTH = tabWidth - 10;
  const PILL_HEIGHT = 42;

  const pillX = useSharedValue(
    activeIndex * tabWidth + (tabWidth - PILL_WIDTH) / 2
  );

  useEffect(() => {
    pillX.value = withSpring(
      activeIndex * tabWidth + (tabWidth - PILL_WIDTH) / 2,
      { damping: 20, stiffness: 160, mass: 0.6 }
    );
  }, [activeIndex, tabWidth, PILL_WIDTH, pillX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        {/* Liquid Glass / frosted background */}
        <GlassBackground
          style={StyleSheet.absoluteFill}
          glassStyle="clear"
          blurIntensity={80}
          blurTint="systemChromeMaterialDark"
          fallbackColor={Platform.OS === 'android' ? 'rgba(8, 8, 10, 0.95)' : 'rgba(10, 10, 12, 0.25)'}
        />

        {/* Animated Pill — frosted capsule behind active tab */}
        <Animated.View
          style={[
            styles.pillOuter,
            { width: PILL_WIDTH, height: PILL_HEIGHT },
            pillStyle,
          ]}
        >
          <View style={[styles.pill, { width: PILL_WIDTH, height: PILL_HEIGHT }]} />
        </Animated.View>

        {/* Tab Items */}
        <View style={styles.tabRow}>
          {routes.map((route, index) => {
            const config = TAB_CONFIG[route.name] || {
              icon: 'questionmark',
              label: route.name,
            };
            const isFocused = state.index === index;

            const handlePress = () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            return (
              <TouchableOpacity
                key={route.key}
                style={styles.tab}
                onPress={handlePress}
                activeOpacity={0.7}
              >
                <IconSymbol
                  name={config.icon as any}
                  size={isFocused ? 22 : 19}
                  color={isFocused ? '#dc2626' : 'rgba(255,255,255,0.4)'}
                />
                {config.label ? (
                  <Text style={[styles.label, isFocused && styles.labelActive]}>
                    {config.label}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 16,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  container: {
    width: TAB_BAR_WIDTH,
    height: TAB_BAR_HEIGHT,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 18,
  },
  // Pill
  pillOuter: {
    position: 'absolute',
    top: (TAB_BAR_HEIGHT - 42) / 2,
    left: 0,
    zIndex: 0,
  },
  pill: {
    borderRadius: 21,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
  },

  // Tabs
  tabRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  labelActive: {
    color: '#dc2626',
    fontWeight: '700',
  },
});
