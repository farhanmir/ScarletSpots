import React, { useRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { GlassBackground } from "./GlassBackground";
import { useGlassTheme } from "./glassTheme";
import { IconSymbol } from "./icon-symbol";

export interface GlassSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onClear?: () => void;
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  autoFocus?: boolean;
  returnKeyType?: TextInput["props"]["returnKeyType"];
  /** Show a small loading indicator dot instead of the clear button */
  loading?: boolean;
}

/**
 * A glass-style search bar with animated focus border and optional clear/loading indicator.
 *
 * Usage:
 * ```tsx
 * <GlassSearchBar
 *   value={query}
 *   onChangeText={setQuery}
 *   placeholder="Search lots, buildings…"
 * />
 * ```
 */
export function GlassSearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
  onFocus,
  onBlur,
  onClear,
  onSubmitEditing,
  style,
  inputStyle,
  autoFocus = false,
  returnKeyType = "search",
  loading = false,
}: Readonly<GlassSearchBarProps>) {
  const inputRef = useRef<TextInput>(null);
  const focusProgress = useSharedValue(0);
  const theme = useGlassTheme();
  const [isFocused, setIsFocused] = useState(false);

  const focusedBorderColor = theme.borderColorFocused;
  const unfocusedBorderColor = theme.borderColor;

  const borderStyle = useAnimatedStyle(() => ({
    borderColor:
      focusProgress.value === 1 ? focusedBorderColor : unfocusedBorderColor,
  }));

  const iconColor = isFocused ? theme.accent : theme.textMuted;

  const handleFocus = () => {
    focusProgress.value = withTiming(1, { duration: 180 });
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    focusProgress.value = withTiming(0, { duration: 180 });
    setIsFocused(false);
    onBlur?.();
  };

  return (
    <Animated.View style={[styles.container, borderStyle, style]}>
      <GlassBackground
        style={StyleSheet.absoluteFill}
        glassStyle="clear"
        blurIntensity={theme.blurLight}
      />

      <IconSymbol
        name="magnifyingglass"
        size={17}
        color={iconColor}
        style={styles.icon}
      />

      <TextInput
        ref={inputRef}
        style={[styles.input, { color: theme.textPrimary }, inputStyle]}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSubmitEditing={onSubmitEditing}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType={returnKeyType}
        autoFocus={autoFocus}
      />

      {value.length > 0 && !loading && (
        <TouchableOpacity
          onPress={() => {
            onChangeText("");
            onClear?.();
            inputRef.current?.focus();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            name="xmark.circle.fill"
            size={17}
            color={theme.textMuted}
          />
        </TouchableOpacity>
      )}

      {loading && (
        <View style={[styles.loadingDot, { backgroundColor: theme.accent }]} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 15,
    overflow: "hidden",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    gap: 10,
  },
  icon: {},
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  loadingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    opacity: 0.7,
  },
});
