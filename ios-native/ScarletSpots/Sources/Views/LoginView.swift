import SwiftUI

// MARK: - LoginView
// Mirror of mobile/src/features/auth/screens/LoginScreen.tsx.

struct LoginView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.colorScheme) private var colorScheme
    @State private var email = ""
    @State private var password = ""
    @State private var errorText: String?
    @State private var isLoading = false
    @FocusState private var focusedField: Field?

    private enum Field {
        case email
        case password
    }

    var body: some View {
        NativeAuthBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // RN uses position: absolute top:60/left:20 for the back
                    // button, but the structural layout mirrors what we do
                    // here: back button, then 24pt gap, then title stack.
                    NativeAuthBackButton()
                        .padding(.bottom, 24)

                    NativeAuthHeader(
                        title: "Welcome Back",
                        subtitle: "Sign in to continue"
                    )
                    .padding(.leading, 4)
                    .padding(.bottom, 40)

                    NativeGlassCard {
                        VStack(alignment: .leading, spacing: 20) {
                            NativeAuthFieldGroup("Rutgers Email") {
                                TextField(
                                    "",
                                    text: $email,
                                    prompt: Text("netid@rutgers.edu")
                                        .foregroundColor(placeholderColor)
                                )
                                .textContentType(.username)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focusedField, equals: .email)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .password }
                                .nativeAuthField()
                            }

                            NativeAuthFieldGroup("Password") {
                                SecureField(
                                    "",
                                    text: $password,
                                    prompt: Text("••••••••")
                                        .foregroundColor(placeholderColor)
                                )
                                .textContentType(.password)
                                .focused($focusedField, equals: .password)
                                .submitLabel(.go)
                                .onSubmit { submitIfAllowed() }
                                .nativeAuthField()
                            }

                            forgotPasswordLink

                            if let errorText {
                                Text(errorText)
                                    .font(.system(size: 13))
                                    .foregroundStyle(NativeAuthColors.red500)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }

                            Button {
                                Task { await performAuth() }
                            } label: {
                                if isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Sign In")
                                }
                            }
                            .buttonStyle(NativeAuthPrimaryButtonStyle())
                            .disabled(isLoading)
                            .padding(.top, 8)

                            NativeAuthDemoBox(
                                boldLabel: "Tip:",
                                message: "Use your NetID or ScarletMail credentials."
                            )
                            .padding(.top, 16)
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 36)
                .padding(.bottom, 40)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var forgotPasswordLink: some View {
        NavigationLink {
            ForgotPasswordView()
        } label: {
            Text("Forgot Password?")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(NativeAuthColors.red500)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.top, -8)
    }

    private var placeholderColor: Color {
        colorScheme == .light ? NativeAuthColors.zinc400 : NativeAuthColors.zinc500
    }

    private func submitIfAllowed() {
        guard !isLoading, !email.isEmpty, !password.isEmpty else { return }
        Task { await performAuth() }
    }

    private func performAuth() async {
        guard !email.isEmpty, !password.isEmpty else {
            errorText = "Please fill in all fields"
            return
        }
        isLoading = true
        defer { isLoading = false }
        errorText = nil
        do {
            try await authManager.signIn(email: email, password: password)
        } catch {
            errorText = error.localizedDescription
        }
    }
}

// MARK: - SignUpView
// Mirror of mobile/src/features/auth/screens/SignUpScreen.tsx.

struct SignUpView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.colorScheme) private var colorScheme
    @State private var fullName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var errorText: String?
    @State private var isLoading = false
    @FocusState private var focusedField: Field?

    private enum Field {
        case name
        case email
        case password
        case confirmPassword
    }

    var body: some View {
        NativeAuthBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    NativeAuthBackButton()
                        .padding(.bottom, 24)

                    NativeAuthHeader(
                        title: "Create Account",
                        subtitle: "Join the ScarletSpots community"
                    )
                    .padding(.leading, 4)
                    .padding(.bottom, 40)

                    NativeGlassCard {
                        VStack(alignment: .leading, spacing: 20) {
                            NativeAuthFieldGroup("Full Name") {
                                TextField(
                                    "",
                                    text: $fullName,
                                    prompt: Text("Scarlet Knight")
                                        .foregroundColor(placeholderColor)
                                )
                                .textContentType(.name)
                                .focused($focusedField, equals: .name)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .email }
                                .nativeAuthField()
                            }

                            NativeAuthFieldGroup("Rutgers Email") {
                                TextField(
                                    "",
                                    text: $email,
                                    prompt: Text("netid@rutgers.edu")
                                        .foregroundColor(placeholderColor)
                                )
                                .textContentType(.username)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focusedField, equals: .email)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .password }
                                .nativeAuthField()
                            }

                            NativeAuthFieldGroup("Password") {
                                SecureField(
                                    "",
                                    text: $password,
                                    prompt: Text("Min 6 characters")
                                        .foregroundColor(placeholderColor)
                                )
                                .textContentType(.newPassword)
                                .focused($focusedField, equals: .password)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .confirmPassword }
                                .nativeAuthField()
                            }

                            NativeAuthFieldGroup("Confirm Password") {
                                SecureField(
                                    "",
                                    text: $confirmPassword,
                                    prompt: Text("Re-enter password")
                                        .foregroundColor(placeholderColor)
                                )
                                .textContentType(.newPassword)
                                .focused($focusedField, equals: .confirmPassword)
                                .submitLabel(.go)
                                .onSubmit { submitIfAllowed() }
                                .nativeAuthField()
                            }

                            if let errorText {
                                Text(errorText)
                                    .font(.system(size: 13))
                                    .foregroundStyle(NativeAuthColors.red500)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }

                            Button {
                                Task { await signUp() }
                            } label: {
                                if isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Create Account")
                                }
                            }
                            .buttonStyle(NativeAuthPrimaryButtonStyle())
                            .disabled(isLoading)
                            .padding(.top, 8)
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 36)
                .padding(.bottom, 40)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var placeholderColor: Color {
        colorScheme == .light ? NativeAuthColors.zinc400 : NativeAuthColors.zinc500
    }

    private func submitIfAllowed() {
        guard !isLoading else { return }
        Task { await signUp() }
    }

    // Matches the `validate()` function in SignUpScreen.tsx.
    private func validate() -> String? {
        if fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || email.isEmpty
            || password.isEmpty
            || confirmPassword.isEmpty
        {
            return "Please fill in all fields"
        }
        if password != confirmPassword { return "Passwords do not match" }
        if password.count < 6 { return "Password must be at least 6 characters" }
        let lowerEmail = email.lowercased()
        if !lowerEmail.hasSuffix("@rutgers.edu"),
           !lowerEmail.hasSuffix("@scarletmail.rutgers.edu")
        {
            return "Please use a valid Rutgers email address"
        }
        return nil
    }

    private func signUp() async {
        if let message = validate() {
            errorText = message
            return
        }
        isLoading = true
        defer { isLoading = false }
        errorText = nil

        let parts = fullName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: " ")
            .map(String.init)
        let firstName = parts.first ?? ""
        let lastName = parts.dropFirst().joined(separator: " ")

        do {
            try await authManager.signUp(
                email: email,
                password: password,
                firstName: firstName,
                lastName: lastName
            )
        } catch {
            errorText = error.localizedDescription
        }
    }
}

// MARK: - ForgotPasswordView
// Mirror of mobile/src/features/auth/screens/ForgotPasswordScreen.tsx.

struct ForgotPasswordView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var isLoading = false
    @State private var sent = false
    @State private var cooldown = 0
    @State private var errorText: String?
    @State private var toast: String?

    private let resendCooldownSeconds = 60

    var body: some View {
        NativeForgotBackground {
            ZStack(alignment: .topLeading) {
                ScrollView {
                    VStack(spacing: 0) {
                        iconBox
                            .padding(.bottom, 24)

                        Text("Reset Password")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(isDark ? Color.white : Color(hex: 0x111111))
                            .padding(.bottom, 10)

                        card
                            .padding(.bottom, 24)

                        backToSignInButton
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 120)
                    .padding(.bottom, 40)
                    .frame(maxWidth: 520)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)

                // Absolute-positioned back button (RN: top:60, left:20) —
                // sits above the scroll view so it's always reachable.
                NativeForgotBackButton()
                    .padding(.top, 44)
                    .padding(.leading, 20)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: Icon

    private var iconBox: some View {
        Image(systemName: sent ? "envelope.open.fill" : "lock.open")
            .font(.system(size: sent ? 48 : 40, weight: .regular))
            .foregroundStyle(.white)
            .frame(width: 80, height: 80)
            .background(accent, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: accent.opacity(0.4), radius: 12, y: 6)
    }

    // MARK: Card

    private var card: some View {
        VStack(alignment: .center, spacing: 0) {
            if sent {
                sentCardContent
            } else {
                inputCardContent
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(cardBorder, lineWidth: 1)
        }
    }

    @ViewBuilder
    private var inputCardContent: some View {
        Text("Enter your Rutgers email and we'll send password reset instructions.")
            .font(.system(size: 15))
            .foregroundStyle(isDark ? NativeAuthColors.zinc400 : NativeAuthColors.zinc500)
            .multilineTextAlignment(.center)
            .lineSpacing(4)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 16)

        TextField(
            "",
            text: $email,
            prompt: Text("netid@rutgers.edu")
                .foregroundColor(isDark ? NativeAuthColors.zinc500 : NativeAuthColors.zinc400)
        )
        .textContentType(.username)
        .keyboardType(.emailAddress)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.send)
        .onSubmit { Task { await handleSend() } }
        .nativeForgotField()
        .padding(.bottom, 14)

        if let errorText {
            Text(errorText)
                .font(.system(size: 13))
                .foregroundStyle(NativeAuthColors.red500)
                .multilineTextAlignment(.center)
                .padding(.bottom, 10)
        }

        Button {
            Task { await handleSend() }
        } label: {
            if isLoading {
                ProgressView().tint(.white)
            } else {
                Text("Send Reset Email")
            }
        }
        .buttonStyle(NativeAuthPrimaryButtonStyle(height: 50, cornerRadius: 10))
        .disabled(isLoading)
    }

    @ViewBuilder
    private var sentCardContent: some View {
        Image(systemName: "envelope.open")
            .font(.system(size: 48, weight: .regular))
            .foregroundStyle(NativeAuthColors.success)
            .padding(.top, 4)
            .padding(.bottom, 16)

        Text("Check your inbox")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(isDark ? NativeAuthColors.zinc300 : Color(hex: 0x111111))
            .padding(.bottom, 8)

        VStack(spacing: 8) {
            (Text("A reset link was sent to\n")
                + Text(email.trimmingCharacters(in: .whitespacesAndNewlines))
                    .foregroundColor(isDark ? NativeAuthColors.zinc300 : Color(hex: 0x111111))
                    .font(.system(size: 14, weight: .semibold)))
                .font(.system(size: 14))
                .foregroundStyle(isDark ? NativeAuthColors.zinc500 : NativeAuthColors.zinc600)
                .multilineTextAlignment(.center)
                .lineSpacing(4)

            Text("Check your spam folder if you don't see it.")
                .font(.system(size: 14))
                .foregroundStyle(isDark ? NativeAuthColors.zinc500 : NativeAuthColors.zinc600)
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 20)

        if let toast {
            Text(toast)
                .font(.system(size: 13))
                .foregroundStyle(NativeAuthColors.success)
                .padding(.bottom, 8)
        }

        Button {
            Task { await handleResend() }
        } label: {
            if isLoading {
                ProgressView().tint(.white)
            } else if cooldown > 0 {
                Text("Resend in \(cooldown)s")
            } else {
                Text("Resend Email")
            }
        }
        .buttonStyle(
            CooldownButtonStyle(
                isCoolingDown: cooldown > 0,
                activeColor: accent,
                inactiveColor: isDark ? NativeAuthColors.zinc800 : NativeAuthColors.zinc300
            )
        )
        .disabled(cooldown > 0 || isLoading)
    }

    // MARK: Secondary button

    private var backToSignInButton: some View {
        Button {
            dismiss()
        } label: {
            Text("Back to Sign In")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(isDark ? NativeAuthColors.zinc300 : NativeAuthColors.zinc700)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(
                    isDark ? NativeAuthColors.zinc800 : Color.black.opacity(0.05),
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(
                            isDark ? NativeAuthColors.zinc700 : Color.black.opacity(0.10),
                            lineWidth: 1
                        )
                }
        }
        .buttonStyle(.plain)
    }

    // MARK: Helpers

    private func handleSend() async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else {
            errorText = "Please enter your Rutgers email."
            return
        }
        guard trimmed.hasSuffix("@rutgers.edu") || trimmed.hasSuffix("@scarletmail.rutgers.edu") else {
            errorText = "Please enter a valid Rutgers email address (@rutgers.edu or @scarletmail.rutgers.edu)."
            return
        }

        isLoading = true
        defer { isLoading = false }
        errorText = nil
        do {
            try await authManager.sendPasswordReset(email: trimmed)
            sent = true
            startCooldown()
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func handleResend() async {
        guard cooldown == 0 else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            try await authManager.sendPasswordReset(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            )
            toast = "Another reset email has been sent."
            Task {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                toast = nil
            }
            startCooldown()
        } catch {
            toast = nil
            errorText = error.localizedDescription
        }
    }

    // Fires a background task that ticks `cooldown` down once per second
    // until it reaches zero. Resets the counter each call.
    private func startCooldown() {
        cooldown = resendCooldownSeconds
        Task {
            while cooldown > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                if cooldown > 0 { cooldown -= 1 }
            }
        }
    }

    private var accent: Color {
        isDark ? NativeAuthColors.scarletDark : NativeAuthColors.scarlet
    }

    private var cardBackground: Color {
        isDark
            ? NativeAuthColors.zinc900.opacity(0.5)
            : Color(hex: 0xF5F5F7).opacity(0.8)
    }

    private var cardBorder: Color {
        isDark ? NativeAuthColors.zinc800 : Color.black.opacity(0.08)
    }

    private var isDark: Bool { colorScheme != .light }
}

// Cooldown-aware button style for the resend action. Swaps fill color based
// on `isCoolingDown` and keeps the press feedback consistent with the other
// auth buttons.
private struct CooldownButtonStyle: ButtonStyle {
    var isCoolingDown: Bool
    var activeColor: Color
    var inactiveColor: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                isCoolingDown ? inactiveColor : activeColor,
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .scaleEffect(configuration.isPressed && !isCoolingDown ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
