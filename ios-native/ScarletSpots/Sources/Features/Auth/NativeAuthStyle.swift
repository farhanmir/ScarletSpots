import SwiftUI

// Shared design tokens + components that mirror the React Native auth UI in
// mobile/src/features/auth/screens/*. Kept intentionally close to the RN
// StyleSheet values (hex codes, radii, heights, paddings) so both platforms
// render as the "same" app.

enum NativeAuthColors {
    // Mobile primary reds. Dark mode uses red-600, light mode uses scarlet.
    static let scarlet = Color(hex: 0xCC0033)
    static let scarletDark = Color(hex: 0xDC2626)
    static let red500 = Color(hex: 0xEF4444)
    static let success = Color(hex: 0x22C55E)

    // Tailwind zinc scale used throughout the RN components.
    static let zinc900 = Color(hex: 0x18181B)
    static let zinc800 = Color(hex: 0x27272A)
    static let zinc700 = Color(hex: 0x3F3F46)
    static let zinc600 = Color(hex: 0x52525B)
    static let zinc500 = Color(hex: 0x71717A)
    static let zinc400 = Color(hex: 0xA1A1AA)
    static let zinc300 = Color(hex: 0xD4D4D8)
    static let zinc200 = Color(hex: 0xE4E4E7)

    // Near-black backgrounds. zinc-950 ≈ #09090B.
    static let zinc950 = Color(hex: 0x09090B)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

// MARK: - Backgrounds

/// Mirrors the primary auth gradient used by AuthChoiceScreen, LoginScreen,
/// and SignUpScreen: a soft top-to-bottom fade (center anchored) from a deep
/// scarlet through zinc-900 to black in dark mode, and a gentle rose tint in
/// light mode. Uses `useColorScheme()`'s RN convention of treating
/// null/undefined as dark, which we replicate with `colorScheme != .light`.
struct NativeAuthBackground<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ZStack {
            (isDark ? Color.black : Color.white)
                .ignoresSafeArea()

            LinearGradient(
                colors: isDark
                    ? [Color(hex: 0x450A0A), Color(hex: 0x18181B), Color(hex: 0x000000)]
                    : [Color(hex: 0xFFF5F5), Color(hex: 0xFEF7F7), Color(hex: 0xFFFFFF)],
                startPoint: UnitPoint(x: 0.5, y: 0.1),
                endPoint: UnitPoint(x: 0.5, y: 0.8)
            )
            .ignoresSafeArea()

            content
        }
    }

    private var isDark: Bool { colorScheme != .light }
}

/// Diagonal gradient used by ForgotPasswordScreen. Runs top-left → bottom-right
/// and reverses order vs. the primary gradient (zinc-950 → zinc-900 → scarlet
/// in dark mode; white → rose in light mode).
struct NativeForgotBackground<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ZStack {
            (isDark ? NativeAuthColors.zinc950 : Color.white)
                .ignoresSafeArea()

            LinearGradient(
                colors: isDark
                    ? [NativeAuthColors.zinc950, NativeAuthColors.zinc900, Color(hex: 0x450A0A)]
                    : [Color(hex: 0xFFFFFF), Color(hex: 0xFEF7F7), Color(hex: 0xFFF5F5)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            content
        }
    }

    private var isDark: Bool { colorScheme != .light }
}

// MARK: - Glass Card

/// Equivalent to the RN `cardContainer` + `GlassBackground` absoluteFill
/// combo used by LoginScreen and SignUpScreen: a 32pt rounded rectangle
/// filled with translucent material and a 1pt hairline border.
struct NativeGlassCard<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    var cornerRadius: CGFloat = 32
    var padding: CGFloat = 32
    private let content: Content

    init(cornerRadius: CGFloat = 32, padding: CGFloat = 32, @ViewBuilder content: () -> Content) {
        self.cornerRadius = cornerRadius
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08), lineWidth: 1)
        }
        .shadow(color: .black.opacity(isDark ? 0.5 : 0.12), radius: 20, y: 10)
    }

    private var isDark: Bool { colorScheme != .light }
}

// MARK: - Text fields

/// Matches the `styles.input` values from LoginScreen.tsx:
///   height 54, radius 14, 16pt horizontal padding, 16pt font, translucent
///   dark fill (rgba(0,0,0,0.2) dark / rgba(0,0,0,0.04) light), hairline
///   border. Placeholder color mirrors #71717a dark / #a1a1aa light.
struct NativeAuthFieldModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .font(.system(size: 16))
            .tint(NativeAuthColors.scarletDark)
            .foregroundStyle(isDark ? Color.white : Color(hex: 0x111111))
            .padding(.horizontal, 16)
            .frame(height: 54)
            .frame(maxWidth: .infinity)
            .background(
                isDark ? Color.black.opacity(0.20) : Color.black.opacity(0.04),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(
                        isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08),
                        lineWidth: 1
                    )
            }
    }

    private var isDark: Bool { colorScheme != .light }
}

extension View {
    func nativeAuthField() -> some View {
        modifier(NativeAuthFieldModifier())
    }
}

/// Lighter variant used by ForgotPasswordScreen's pre-sent state: smaller
/// (height 50, radius 10, 14pt horizontal padding, 15pt font) and opaque
/// zinc-800 fill in dark mode.
struct NativeForgotFieldModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .font(.system(size: 15))
            .tint(NativeAuthColors.scarletDark)
            .foregroundStyle(isDark ? Color.white : Color(hex: 0x111111))
            .padding(.horizontal, 14)
            .frame(height: 50)
            .frame(maxWidth: .infinity)
            .background(
                isDark ? NativeAuthColors.zinc800 : Color.black.opacity(0.04),
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(
                        isDark ? NativeAuthColors.zinc700 : Color.black.opacity(0.12),
                        lineWidth: 1
                    )
            }
    }

    private var isDark: Bool { colorScheme != .light }
}

extension View {
    func nativeForgotField() -> some View {
        modifier(NativeForgotFieldModifier())
    }
}

// MARK: - Buttons

/// Full-width primary CTA: scarlet fill, 56pt height, 16pt corner radius,
/// 17pt bold white label, scarlet drop shadow. Matches the RN `button`
/// style used on LoginScreen and SignUpScreen.
struct NativeAuthPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    var height: CGFloat = 56
    var cornerRadius: CGFloat = 16

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .bold))
            .kerning(0.3)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(
                buttonColor.opacity(isEnabled ? 1 : 0.55),
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .shadow(color: buttonColor.opacity(isEnabled ? 0.35 : 0), radius: 12, y: 6)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var buttonColor: Color {
        colorScheme == .light ? NativeAuthColors.scarlet : NativeAuthColors.scarletDark
    }
}

/// Full-width secondary / outline CTA used as the "Sign In" button on
/// AuthChoiceScreen and the "Back to Sign In" button on ForgotPassword.
struct NativeAuthSecondaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme
    var height: CGFloat = 58
    var cornerRadius: CGFloat = 18

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .kerning(0.3)
            .foregroundStyle(isDark ? NativeAuthColors.zinc200 : Color(hex: 0x111111))
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(
                backgroundColor,
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            }
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var isDark: Bool { colorScheme != .light }

    private var backgroundColor: Color {
        isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.04)
    }

    private var borderColor: Color {
        isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.10)
    }
}

// MARK: - Back button

/// Chevron in a pill, used on Login/SignUp screens (40x40, rounded 20).
struct NativeAuthBackButton: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button {
            dismiss()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(isDark ? NativeAuthColors.zinc200 : Color(hex: 0x111111))
                .frame(width: 40, height: 40)
                .padding(.trailing, 2) // optical center match to RN
                .background(
                    isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06),
                    in: Circle()
                )
                .overlay {
                    Circle()
                        .stroke(
                            isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.08),
                            lineWidth: 1
                        )
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back")
    }

    private var isDark: Bool { colorScheme != .light }
}

/// Larger back button used on ForgotPasswordScreen (44x44, top-left absolute
/// position). Uses an arrow glyph instead of a chevron.
struct NativeForgotBackButton: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button {
            dismiss()
        } label: {
            Image(systemName: "arrow.backward")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(isDark ? NativeAuthColors.zinc400 : Color(hex: 0x52525B))
                .frame(width: 44, height: 44)
                .background(
                    isDark ? NativeAuthColors.zinc800.opacity(0.8) : Color.black.opacity(0.06),
                    in: Circle()
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back")
    }

    private var isDark: Bool { colorScheme != .light }
}

// MARK: - Reusable header / field group / status helpers

struct NativeAuthHeader: View {
    let title: String
    let subtitle: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 34, weight: .heavy, design: .rounded))
                .kerning(-0.5)
                .foregroundStyle(isDark ? Color.white : Color(hex: 0x111111))
            Text(subtitle)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(isDark ? NativeAuthColors.zinc400 : NativeAuthColors.zinc500)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var isDark: Bool { colorScheme != .light }
}

struct NativeAuthFieldGroup<Content: View>: View {
    let label: String
    private let content: Content
    @Environment(\.colorScheme) private var colorScheme

    init(_ label: String, @ViewBuilder content: () -> Content) {
        self.label = label
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(isDark ? NativeAuthColors.zinc300 : NativeAuthColors.zinc700)
            content
        }
    }

    private var isDark: Bool { colorScheme != .light }
}

/// Matches the "Tip / demo" info pill used on LoginScreen: centered text with
/// an optional bold lead-in (e.g. "Tip: ") inside a soft translucent card.
struct NativeAuthDemoBox: View {
    let boldLabel: String?
    let message: String
    @Environment(\.colorScheme) private var colorScheme

    init(boldLabel: String? = nil, message: String) {
        self.boldLabel = boldLabel
        self.message = message
    }

    var body: some View {
        Text(attributed)
            .multilineTextAlignment(.center)
            .lineSpacing(2)
            .frame(maxWidth: .infinity)
            .padding(14)
            .background(
                isDark ? Color.black.opacity(0.25) : Color.black.opacity(0.04),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(
                        isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.06),
                        lineWidth: 1
                    )
            }
    }

    private var attributed: AttributedString {
        var string = AttributedString()
        if let boldLabel {
            var head = AttributedString(boldLabel + " ")
            head.font = .system(size: 13, weight: .bold)
            head.foregroundColor = isDark ? NativeAuthColors.zinc200 : NativeAuthColors.zinc700
            string.append(head)
        }
        var tail = AttributedString(message)
        tail.font = .system(size: 13)
        tail.foregroundColor = isDark ? NativeAuthColors.zinc400 : NativeAuthColors.zinc500
        string.append(tail)
        return string
    }

    private var isDark: Bool { colorScheme != .light }
}
