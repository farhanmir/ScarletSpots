import SwiftUI
import CoreLocation
import CoreMotion

struct LoginView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var email = ""
    @State private var password = ""
    @State private var errorText: String?
    @State private var isLoading = false

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text("Sign In").font(.largeTitle.bold())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 12)

                VStack(spacing: 10) {
                    TextField("Email (@rutgers.edu)", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                    SecureField("Password", text: $password)
                        .textFieldStyle(.roundedBorder)
                }

                if let errorText {
                    Text(errorText)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await performAuth() }
                } label: {
                    HStack {
                        if isLoading { ProgressView().tint(.white) }
                        Text("Sign In").font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(isLoading || email.isEmpty || password.isEmpty)

                NavigationLink("Forgot Password?", destination: ForgotPasswordView())
                    .font(.footnote)

                Spacer(minLength: 40)
            }
            .padding(20)
        }
    }

    private func performAuth() async {
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

struct SignUpView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var errorText: String?
    @State private var isLoading = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Text("Create Account")
                    .font(.largeTitle.bold())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 12)

                HStack(spacing: 10) {
                    TextField("First Name", text: $firstName).textFieldStyle(.roundedBorder)
                    TextField("Last Name", text: $lastName).textFieldStyle(.roundedBorder)
                }
                TextField("Rutgers Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                SecureField("Password", text: $password).textFieldStyle(.roundedBorder)
                SecureField("Confirm Password", text: $confirmPassword).textFieldStyle(.roundedBorder)

                if let errorText {
                    Text(errorText)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await signUp() }
                } label: {
                    HStack {
                        if isLoading { ProgressView().tint(.white) }
                        Text("Create Account").font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(isLoading || !canSubmit)
            }
            .padding(20)
        }
    }

    private var canSubmit: Bool {
        !firstName.isEmpty && !lastName.isEmpty && !email.isEmpty && password.count >= 6
    }

    private func signUp() async {
        guard password == confirmPassword else {
            errorText = "Passwords do not match."
            return
        }
        isLoading = true
        defer { isLoading = false }
        errorText = nil
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

struct ForgotPasswordView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var email = ""
    @State private var statusText = ""

    var body: some View {
        VStack(spacing: 16) {
            Text("Reset Password").font(.title.bold())
            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textFieldStyle(.roundedBorder)
            Button("Send Reset Link") {
                Task {
                    do {
                        try await authManager.sendPasswordReset(email: email)
                        statusText = "Reset email sent. Check your inbox."
                    } catch {
                        statusText = error.localizedDescription
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            Text(statusText).font(.caption).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(20)
    }
}
