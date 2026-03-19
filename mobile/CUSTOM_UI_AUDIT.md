# Custom / Non-Native UI Audit

This list covers UI that is **manually implemented** (custom components or RN primitives) rather than using native system controls. Use it to decide if you want to replace any with a better option.

---

## 1. **Tab bar** — DONE

- **Was**: Custom `LiquidGlassTabBar` (Reanimated sliding pill + `GlassBackground` + `TouchableOpacity`) in `src/navigation/components/LiquidGlassTabBar.tsx`.
- **Status**: **Decommissioned** (file removed).
- **Now**: **Native liquid glass tabs** via `expo-router/unstable-native-tabs` (`NativeTabs`). Tab order: **Search | Map | Friends | Profile** (Search leftmost).

---

## 2. **GlassBackground** (`src/shared/components/ui/GlassBackground.tsx`)

- **What**: Wrapper that uses `expo-glass-effect` `GlassView` on iOS 26+, `expo-blur` `BlurView` on older iOS, and a solid translucent color on Android.
- **Used in**: Session chip, center-on-map button, LotDetails panel, ParkingConfirmationSheet, auth/onboarding screens.
- **Alternatives**: Rely on native materials where available; keep for consistent “glass” look across screens.

---

## 3. **IconSymbol** (`src/shared/components/ui/icon-symbol.tsx` + `.ios.tsx`)

- **What**: Cross-platform icon component. **iOS**: `expo-symbols` `SymbolView` (SF Symbols). **Android/default**: `@expo/vector-icons` MaterialIcons/MaterialCommunityIcons with a manual SF Symbol → Material name mapping.
- **Used in**: Tab bar (now native icons), buttons, list items, LotDetails, ParkingConfirmationSheet, etc.
- **Alternatives**: Use native tab icons only for tabs (already done with NativeTabs); keep IconSymbol for in-screen icons, or move to a single vector set (e.g. one icon library with a full set).

---

## 4. **ParkingConfirmationSheet** (`src/features/home/components/ParkingConfirmationSheet.tsx`)

- **What**: Custom bottom sheet: Reanimated enter animation, pan gesture to dismiss, `GlassBackground`, custom “PressButton” with scale animation.
- **Alternatives**: `@gorhom/bottom-sheet` or `react-native-bottom-sheet` for a more native-feel sheet with handle and gestures.

---

## 5. **LotDetails** (`src/features/home/components/LotDetails.tsx`)

- **What**: Lot detail panel implemented with RN `Modal` (transparent) + Reanimated `FadeIn`/`SlideInDown` + `GlassBackground` + `ScrollView` + custom styling.
- **Alternatives**: Same as ParkingConfirmationSheet — native-stack modal or a bottom sheet library for a consistent sheet pattern.

---

## 6. **FriendsScreen “Add Friend” modal** (`src/features/profile/screens/FriendsScreen.tsx`)

- **What**: RN `Modal` with custom overlay, text input, and buttons.
- **Alternatives**: Native modal presentation or a shared bottom sheet / dialog component.

---

## 7. **Alerts** (throughout app)

- **What**: `Alert.alert()` for confirmations (e.g. End Session, Block User), errors (e.g. “Failed to start parking session”), and success messages.
- **Alternatives**: On iOS, `ActionSheetIOS` or native-style action sheets; on Android, Material dialogs; or a single cross-platform dialog/toast component (e.g. `react-native-paper` dialogs, or a small custom wrapper).

---

## 8. **Collapsible** (`src/shared/components/ui/collapsible.tsx`)

- **What**: Custom collapsible section (header + expand/collapse with `TouchableOpacity`).
- **Used in**: Likely settings or detail sections.
- **Alternatives**: An accordion/expandable from a UI kit, or keep if usage is limited.

---

## 9. **ParallaxScrollView** (`src/shared/components/parallax-scroll-view.tsx`)

- **What**: Custom parallax header using Reanimated `useScrollOffset` and `interpolate`.
- **Alternatives**: Keep as-is, or use something like `react-native-parallax-scroll-view` if you want a maintained library.

---

## 10. **ForecastChart / ForecastSlices** (`src/features/home/components/lots/ForecastChart.tsx`, `ForecastSlices.tsx`)

- **What**: Custom chart/slices built from `View`/style (no native chart control).
- **Alternatives**: `react-native-chart-kit`, `victory-native`, or similar for richer charts and less custom code.

---

## 11. **OfflineBanner** (`src/shared/components/ui/OfflineBanner.tsx`)

- **What**: Simple banner (View + Text) for “Offline — actions will sync when reconnected”.
- **Alternatives**: Could be a native banner or a small toast/snackbar library.

---

## 12. **CandidatePin** (`src/features/home/components/Map/CandidatePin.tsx`)

- **What**: Custom map overlay (Animated View) for detection candidates.
- **Alternatives**: Usually keep custom for map pins; could align styling with a design system.

---

## 13. **OccupancyBadge** (`src/features/home/components/lots/OccupancyBadge.tsx`)

- **What**: Small colored dot + optional text for occupancy.
- **Alternatives**: Could be a standard “badge” or “chip” from a UI library.

---

## 14. **ThemedText / ThemedView** (`src/shared/components/themed-text.tsx`, `themed-view.tsx`)

- **What**: Wrappers around RN `Text`/`View` that apply theme colors.
- **Alternatives**: Replace with a design system or native theming (e.g. `useColorScheme` + tokens) if you standardize on one approach.

---

## 15. **LinearGradient** (expo-linear-gradient)

- **What**: Used on auth, onboarding, profile, and search screens for backgrounds.
- **Alternatives**: Usually kept; common and well-supported.

---

## 16. **Haptics** (expo-haptics)

- **What**: Used on custom buttons (e.g. favorite toggle, confirm) and previously in the custom tab bar.
- **Alternatives**: Keep for custom pressables; native tabs handle their own haptics.

---

_Generated for ScarletSpots mobile. Update this file when you replace or add custom UI._
