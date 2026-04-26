import SwiftUI

/// Friends screen — parity with the RN screen.
///
/// Three segments: "Crew" (accepted friendships), "Requests" (incoming
/// pending invites), and "Blocked". Supports:
/// - Sending an invite by Rutgers email.
/// - Accept / decline on incoming requests.
/// - Block / unblock.
/// - Per-friend "share parking location" toggle (server-side flag that
///   enables the other side to see the current parked lot).
struct FriendsView: View {
    @StateObject private var auth = AuthManager.shared
    @StateObject private var lotRepository = LotRepository.shared

    @State private var friends: [Friendship] = []
    @State private var requests: [Friendship] = []
    @State private var blocked: [Friendship] = []
    @State private var selectedTab = 0
    @State private var showAddFriend = false
    @State private var friendEmail = ""
    @State private var error: String?
    @State private var isLoading = false
    @State private var showFriendRequestAlert = false
    @State private var notificationSocket: AuthedWebSocket?
    @State private var pollingTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $selectedTab) {
                    Text("Crew").tag(0)
                    Text("Requests \(requests.isEmpty ? "" : "(\(requests.count))")").tag(1)
                    Text("Blocked").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.top, 8)

                if isLoading && friends.isEmpty && requests.isEmpty {
                    Spacer()
                    ProgressView().tint(Color(hex: 0xCC0033))
                    Spacer()
                } else {
                    List {
                        if let error {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(.red)
                                .listRowBackground(Color.clear)
                        }
                        switch selectedTab {
                        case 0: crewSection
                        case 1: requestsSection
                        default: blockedSection
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable { await load() }
                }
            }
            .navigationTitle("Friends")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAddFriend = true } label: {
                        Image(systemName: "person.badge.plus")
                    }
                    .accessibilityLabel("Invite a friend")
                }
            }
            .sheet(isPresented: $showAddFriend) { addFriendSheet }
            .alert("New Friend Request", isPresented: $showFriendRequestAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Someone just sent you a friend request.")
            }
            .task {
                await load()
                startRealtimeRefresh()
            }
            .onDisappear { stopRealtimeRefresh() }
            .onChange(of: selectedTab) { _, _ in error = nil }
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private var crewSection: some View {
        if friends.isEmpty {
            ContentUnavailableView(
                "No friends yet",
                systemImage: "person.2",
                description: Text("Tap the plus to invite your first friend.")
            )
            .listRowBackground(Color.clear)
        } else {
            ForEach(friends) { friend in
                friendRow(friend: friend)
            }
        }
    }

    @ViewBuilder
    private var requestsSection: some View {
        if requests.isEmpty {
            ContentUnavailableView("No requests", systemImage: "envelope")
                .listRowBackground(Color.clear)
        } else {
            ForEach(requests) { request in
                requestRow(request: request)
            }
        }
    }

    @ViewBuilder
    private var blockedSection: some View {
        if blocked.isEmpty {
            ContentUnavailableView(
                "No one blocked",
                systemImage: "hand.raised",
                description: Text("Blocked users can't send you requests or see your sessions.")
            )
            .listRowBackground(Color.clear)
        } else {
            ForEach(blocked) { b in
                HStack {
                    Text(b.name)
                    Spacer()
                    Button("Unblock") {
                        Task {
                            guard let id = b.userId ?? b.friendId else { return }
                            try? await FriendsAPI.unblock(id)
                            await load()
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
        }
    }

    // MARK: - Rows

    private func friendRow(friend: Friendship) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                avatar(name: friend.name)
                VStack(alignment: .leading) {
                    Text(friend.name).font(.headline)
                    if let lotId = friend.lotId, friend.parked == true {
                        Label("Parked at \(lotName(for: lotId))", systemImage: "parkingsign.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.red)
                    } else {
                        Text("Not parked").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Menu {
                    Toggle("Share my parking", isOn: Binding(
                        get: { friend.sharingEnabled ?? false },
                        set: { newValue in
                            Task { try? await FriendsAPI.setSharing(friend.id, enabled: newValue) }
                            toggleSharingLocally(friend: friend, enabled: newValue)
                        }
                    ))
                    Button("Block", role: .destructive) {
                        Task {
                            guard let userId = friend.userId ?? friend.friendId else { return }
                            try? await FriendsAPI.block(userId)
                            await load()
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                }
                .accessibilityLabel("More actions for \(friend.name)")
            }
        }
    }

    private func requestRow(request: Friendship) -> some View {
        HStack {
            avatar(name: request.name)
            VStack(alignment: .leading) {
                Text(request.name).font(.subheadline.bold())
                Text("Wants to be your friend").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Accept") {
                Task { try? await FriendsAPI.accept(request.id); await load() }
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .controlSize(.small)
            Button("Decline") {
                Task { try? await FriendsAPI.decline(request.id); await load() }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
    }

    private func avatar(name: String) -> some View {
        let initials = name
            .split(separator: " ")
            .prefix(2)
            .compactMap { $0.first.map(String.init) }
            .joined()
        return ZStack {
            Circle().fill(Color(hex: 0xCC0033).opacity(0.12))
            Text(initials)
                .font(.callout.bold())
                .foregroundStyle(Color(hex: 0xCC0033))
        }
        .frame(width: 36, height: 36)
    }

    // MARK: - Add friend

    private var addFriendSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("name@scarletmail.rutgers.edu", text: $friendEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                } header: {
                    Text("Invite by email")
                } footer: {
                    Text("They'll get a notification and can accept from their Requests tab.")
                }
                if let error {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
            }
            .navigationTitle("Add Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showAddFriend = false; friendEmail = ""; error = nil }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task { await sendInvite() }
                    }
                    .disabled(friendEmail.isEmpty)
                }
            }
        }
    }

    // MARK: - Data

    private func load(showSpinner: Bool = true) async {
        if showSpinner { isLoading = true }
        defer { if showSpinner { isLoading = false } }
        do {
            let response = try await FriendsAPI.list()
            friends = response.friends
            requests = response.requests
            blocked = response.blocked
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func startRealtimeRefresh() {
        guard notificationSocket == nil else { return }
        guard let wsBase = WebSocketURL.wsScheme(from: Env.apiBaseURL) else { return }

        let socket = AuthedWebSocket(endpoint: wsBase.appendingPathComponent("ws/notifications")) { payload in
            guard payload["type"] as? String == "notification",
                  let details = payload["payload"] as? [String: Any],
                  details["event"] as? String == "friend_request"
            else { return }

            Task { @MainActor in
                selectedTab = 1
                showFriendRequestAlert = true
                await load(showSpinner: false)
            }
        }
        notificationSocket = socket
        socket.start(accessTokenProvider: { auth.accessToken })

        pollingTask?.cancel()
        pollingTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                if Task.isCancelled { break }
                await load(showSpinner: false)
            }
        }
    }

    private func stopRealtimeRefresh() {
        notificationSocket?.stop()
        notificationSocket = nil
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func lotName(for lotId: String) -> String {
        lotRepository.byId(lotId)?.shortName ?? lotId
    }

    private func sendInvite() async {
        do {
            try await FriendsAPI.request(email: friendEmail)
            friendEmail = ""
            showAddFriend = false
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func toggleSharingLocally(friend: Friendship, enabled: Bool) {
        if let idx = friends.firstIndex(where: { $0.id == friend.id }) {
            let old = friends[idx]
            friends[idx] = Friendship(
                id: old.id,
                friendId: old.friendId,
                userId: old.userId,
                name: old.name,
                status: old.status,
                parked: old.parked,
                lotId: old.lotId,
                sharingEnabled: enabled
            )
        }
    }
}

