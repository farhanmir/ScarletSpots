import SwiftUI

// Mirror of mobile/src/features/auth/screens/AuthChoiceScreen.tsx.
struct AuthChoiceView: View {
    @Environment(\.colorScheme) private var colorScheme

    // Breath scale on the hero text: 1.0 <-> 1.04, 1400ms autoreversed. Maps
    // to the Reanimated `withRepeat(withTiming(...), -1, true)` loop.
    @State private var breathScale: CGFloat = 1.0
    // Staged entry animations — matches FadeInDown.delay(100) / .delay(200)
    // / SlideInDown.delay(400) from the RN version.
    @State private var showLogo = false
    @State private var showText = false
    @State private var showActions = false

    var body: some View {
        NavigationStack {
            NativeAuthBackground {
                VStack(spacing: 0) {
                    heroSection
                        .frame(maxWidth: .infinity, maxHeight: .infinity)

                    actionsSheet
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(NativeAuthColors.scarletDark)
        .onAppear { startAnimations() }
    }

    // MARK: - Hero

    private var heroSection: some View {
        VStack(spacing: 32) {
            logoBlock
                .opacity(showLogo ? 1 : 0)
                .offset(y: showLogo ? 0 : -20)

            VStack(spacing: 10) {
                Text("ScarletSpots")
                    .font(.system(size: 40, weight: .heavy, design: .rounded))
                    .kerning(-1)
                    .foregroundStyle(isDark ? Color.white : Color(hex: 0x111111))
                Text("Parking at Rutgers, solved.")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(isDark ? NativeAuthColors.zinc400 : NativeAuthColors.zinc500)
            }
            .multilineTextAlignment(.center)
            .scaleEffect(breathScale)
            .opacity(showText ? 1 : 0)
            .offset(y: showText ? 0 : -20)
        }
        .padding(.horizontal, 24)
        .padding(.top, 40)
        .frame(maxWidth: .infinity)
    }

    private var logoBlock: some View {
        Image("AppLogo")
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: 140, height: 140)
            .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
            .shadow(
                color: NativeAuthColors.scarletDark.opacity(0.25),
                radius: 24,
                y: 12
            )
    }

    // MARK: - Actions bottom sheet

    private var actionsSheet: some View {
        VStack(spacing: 16) {
            NavigationLink {
                SignUpView()
            } label: {
                HStack(spacing: 8) {
                    Text("Create Account")
                    Image(systemName: "arrow.right")
                        .font(.system(size: 18, weight: .bold))
                }
            }
            .buttonStyle(NativeAuthPrimaryButtonStyle(height: 58, cornerRadius: 18))

            NavigationLink {
                LoginView()
            } label: {
                Text("Sign In")
            }
            .buttonStyle(NativeAuthSecondaryButtonStyle(height: 58, cornerRadius: 18))

            termsText
        }
        .padding(.horizontal, 24)
        .padding(.top, 32)
        .padding(.bottom, 48)
        .frame(maxWidth: .infinity)
        .background {
            sheetBackground
                .ignoresSafeArea(edges: .bottom)
        }
        .offset(y: showActions ? 0 : 40)
        .opacity(showActions ? 1 : 0)
    }

    private var sheetBackground: some View {
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: 32,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: 32,
            style: .continuous
        )
        return ZStack {
            shape.fill(.regularMaterial)
            shape.fill(isDark ? Color.black.opacity(0.15) : Color.white.opacity(0.25))
            shape.stroke(
                isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.06),
                lineWidth: 1
            )
        }
    }

    private var termsText: some View {
        // Mobile uses three color tiers in the terms line — base body color,
        // a slightly lighter "link" color with underline for Terms/Privacy
        // Policy, and an even lighter color for the "Rutgers students & staff
        // only" tagline. We reproduce those tiers via inline .foregroundColor
        // on individual Text segments.
        let baseColor = isDark ? Color(hex: 0x52525B) : NativeAuthColors.zinc500
        let linkColor = isDark ? NativeAuthColors.zinc400 : Color(hex: 0x52525B)
        let tagColor = isDark ? NativeAuthColors.zinc500 : NativeAuthColors.zinc400

        return (
            Text("By continuing, you agree to our ")
                + Text("Terms").underline().foregroundColor(linkColor)
                + Text(" & ")
                + Text("Privacy Policy").underline().foregroundColor(linkColor)
                + Text(".\n")
                + Text("Rutgers students & staff only.").foregroundColor(tagColor)
        )
        .font(.system(size: 12))
        .lineSpacing(4)
        .multilineTextAlignment(.center)
        .foregroundStyle(baseColor)
        .padding(.top, 16)
    }

    // MARK: - Animations

    private func startAnimations() {
        withAnimation(.easeOut(duration: 0.8).delay(0.1)) { showLogo = true }
        withAnimation(.easeOut(duration: 0.8).delay(0.2)) { showText = true }
        withAnimation(.easeOut(duration: 0.8).delay(0.4)) { showActions = true }
        withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
            breathScale = 1.04
        }
    }

    private var isDark: Bool { colorScheme != .light }
}
