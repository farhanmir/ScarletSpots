import SwiftUI

/// Two-step permit picker with search, grouped sections, and an optional
/// secondary commuter permit.
///
/// Native permit onboarding flow:
/// - Step 1: primary permit (or one of the "no permit" sentinels).
/// - Step 2 (commuters only): secondary commuter permit on a different
///   campus than the primary.
///
/// `fromProfile` controls whether we "save and dismiss" (updating an existing
/// user's permit from Settings) vs. "save and continue to main tabs"
/// (new-user onboarding).
struct PermitOnboardingView: View {
    let fromProfile: Bool
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var permitRepository = PermitRepository.shared

    @Environment(\.dismiss) private var dismiss

    @State private var selected: String?
    @State private var secondarySelected: String?
    @State private var noPermitMode: NoPermitMode = .none
    @State private var query = ""
    @State private var step: Step = .primary
    @State private var isSaving = false

    private enum Step { case primary, secondary }
    private enum NoPermitMode: Equatable {
        case none
        case all
        case commuterAll
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            searchBar
            content
            footer
        }
        .background(
            LinearGradient(
                colors: [Color(.systemBackground), Color(.systemGroupedBackground)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .toolbar(fromProfile ? .hidden : .visible, for: .tabBar)
        .onAppear { seedFromStoredPreferences() }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(step == .primary ? "Your Parking Permit" : "Secondary Permit")
                .font(.title2.bold())
            Text(step == .primary
                 ? (fromProfile ? "Update your permit to filter lots on the map." : "Tell us your permit so we only show relevant lots.")
                 : "Commuters can pick a secondary lot on another campus.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                stepPill(label: "Primary", active: step == .primary)
                stepPill(label: "Secondary", active: step == .secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Search bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search permits", text: $query)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .padding(.top, 10)
    }

    // MARK: - Content

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if step == .primary {
                    noPermitCard
                }

                ForEach(groupedSections, id: \.title) { section in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(section.title.uppercased())
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                            .tracking(1)
                            .padding(.horizontal, 16)
                        ForEach(section.permits, id: \.self) { permit in
                            permitRow(permit: permit)
                        }
                    }
                }

                if groupedSections.isEmpty {
                    Text("No permits match \"\(query)\"")
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                }
            }
            .padding(.vertical, 14)
            .padding(.bottom, 8)
        }
    }

    private func permitRow(permit: String) -> some View {
        let isActive = (step == .primary)
            ? (selected == permit && noPermitMode == .none)
            : (secondarySelected == permit)
        return Button {
            tap(permit: permit)
        } label: {
            HStack {
                Text(permit)
                    .font(.subheadline)
                    .foregroundStyle(isActive ? Color.red : Color.primary)
                    .textSelection(.enabled)
                Spacer()
                if isActive {
                    Image(systemName: "checkmark").foregroundStyle(.red)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(isActive ? Color.red.opacity(0.08) : Color(.secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(isActive ? Color.red.opacity(0.5) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.vertical, 2)
        .accessibilityLabel(permit)
        .accessibilityAddTraits(isActive ? [.isSelected, .isButton] : .isButton)
        .accessibilityHint(
            step == .primary
                ? "Select as your primary permit."
                : "Select as your secondary commuter permit."
        )
    }

    // MARK: - No-permit card

    private var noPermitCard: some View {
        VStack(spacing: 0) {
            let cardExpanded = noPermitMode != .none
            Button {
                noPermitMode = cardExpanded ? .none : .all
                if !cardExpanded { selected = nil }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("I don't have a permit")
                            .font(.subheadline.bold())
                        Text("Choose what to show on the map")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: cardExpanded ? "chevron.up" : "chevron.down")
                        .foregroundStyle(.secondary)
                }
                .padding(14)
            }
            .buttonStyle(.plain)

            if cardExpanded {
                Divider()
                noPermitOption(title: "Show all lots",
                               subtitle: "Every lot on the map. No filter.",
                               mode: .all)
                Divider()
                noPermitOption(title: "All commuter lots",
                               subtitle: "Every commuter-accessible lot across campuses.",
                               mode: .commuterAll)
            }
        }
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .padding(.horizontal, 16)
    }

    private func noPermitOption(title: String, subtitle: String, mode: NoPermitMode) -> some View {
        Button {
            noPermitMode = (noPermitMode == mode) ? .none : mode
            selected = nil
        } label: {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.weight(.medium))
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if noPermitMode == mode {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }
            .padding(14)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: 8) {
            Button {
                Task { await handleNext() }
            } label: {
                HStack {
                    if isSaving { ProgressView().tint(.white) }
                    Text(primaryTitle).font(.headline)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .disabled(!canConfirm || isSaving)
            .opacity(!canConfirm || isSaving ? 0.6 : 1)
            .frame(height: 52)
            .background(Color(hex: 0xCC0033), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(.white)
            .shadow(color: Color(hex: 0xCC0033).opacity(0.25), radius: 10, y: 5)

            Button {
                Task { await skip() }
            } label: {
                Text(skipTitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 16)
        .background(Color(.systemBackground))
    }

    private func stepPill(label: String, active: Bool) -> some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(active ? Color.red.opacity(0.16) : Color.secondary.opacity(0.15), in: Capsule())
            .foregroundStyle(active ? Color.red : .secondary)
    }

    private var primaryTitle: String {
        if step == .primary && isCommuter { return "Next" }
        return fromProfile ? "Save Permit" : "Continue"
    }

    private var skipTitle: String {
        switch step {
        case .primary: return fromProfile ? "Cancel" : "Skip for now"
        case .secondary: return "Skip (No secondary set)"
        }
    }

    // MARK: - Data

    private var allPermits: [String] {
        permitRepository.allPermitTypes
    }

    private var filteredPermits: [String] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return allPermits }
        return allPermits.filter { $0.lowercased().contains(q) }
    }

    private var isCommuter: Bool {
        guard let selected else { return false }
        return selected.lowercased().contains("commuter")
    }

    private var secondarySource: [String] {
        guard let selected else { return [] }
        let primaryCampus = selected.split(separator: " ").first.map(String.init) ?? ""
        return allPermits.filter { p in
            p.lowercased().contains("commuter") && !p.hasPrefix(primaryCampus)
        }
    }

    private var groupedSections: [PermitSection] {
        let source = (step == .primary) ? filteredPermits : secondarySourceFiltered
        return Self.group(permits: source)
    }

    private var secondarySourceFiltered: [String] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return secondarySource }
        return secondarySource.filter { $0.lowercased().contains(q) }
    }

    private var canConfirm: Bool {
        switch step {
        case .primary:
            if noPermitMode != .none { return true }
            return selected != nil
        case .secondary:
            return secondarySelected != nil
        }
    }

    // MARK: - Actions

    private func tap(permit: String) {
        if step == .primary {
            selected = permit
            noPermitMode = .none
            secondarySelected = nil
        } else {
            secondarySelected = permit
        }
    }

    private func handleNext() async {
        if step == .primary, isCommuter {
            query = ""
            step = .secondary
            return
        }
        await saveAndExit()
    }

    private func skip() async {
        if step == .secondary {
            secondarySelected = nil
            await saveAndExit()
        } else {
            dismiss()
        }
    }

    private func saveAndExit() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        let primary: String?
        switch noPermitMode {
        case .all: primary = PermitRepository.noPermitAll
        case .commuterAll: primary = PermitRepository.noPermitCommuter
        case .none: primary = selected
        }
        let secondary = (step == .secondary || isCommuter) && noPermitMode == .none
            ? secondarySelected
            : nil
        await authManager.setPermitPreference(primary: primary, secondary: secondary)
        if fromProfile { dismiss() }
    }

    private func seedFromStoredPreferences() {
        let stored = authManager.permitType
        if stored == PermitRepository.noPermitAll {
            noPermitMode = .all
        } else if stored == PermitRepository.noPermitCommuter {
            noPermitMode = .commuterAll
        } else {
            selected = stored
        }
        secondarySelected = authManager.secondaryPermitType
    }

    // MARK: - Grouping

    struct PermitSection {
        let title: String
        let permits: [String]
    }

    static func group(permits: [String]) -> [PermitSection] {
        var buckets: [(String, [String])] = [
            ("Commuter", []),
            ("Resident", []),
            ("Faculty & Staff", []),
            ("Health & Hospital", []),
            ("Non-Affiliate", []),
            ("Retiree & Senior", []),
            ("Visitor", []),
            ("Other", [])
        ]
        for permit in permits {
            if permit.contains("Commuter") { buckets[0].1.append(permit) }
            else if permit.contains("Resident") { buckets[1].1.append(permit) }
            else if permit.contains("Faculty") || permit.contains("Staff") { buckets[2].1.append(permit) }
            else if permit.contains("Health") || permit.contains("Hospital") { buckets[3].1.append(permit) }
            else if permit.contains("Non-Affiliate") { buckets[4].1.append(permit) }
            else if permit.contains("Retiree") || permit.contains("Senior") { buckets[5].1.append(permit) }
            else if permit.contains("Visitor") { buckets[6].1.append(permit) }
            else { buckets[7].1.append(permit) }
        }
        return buckets.filter { !$0.1.isEmpty }.map { .init(title: $0.0, permits: $0.1) }
    }
}
