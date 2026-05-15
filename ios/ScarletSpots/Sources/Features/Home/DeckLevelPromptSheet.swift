import SwiftUI

/// Shown after auto-park (or when returning) only for garage/deck lots — see `Lot.shouldPromptForDeckLevel`.
struct DeckLevelPromptSheet: View {
    let lotId: String
    var onFinished: () -> Void

    @StateObject private var lots = LotRepository.shared
    @State private var choice: DeckChoice = .skip
    @State private var otherText = ""
    @State private var saving = false
    @State private var errorText: String?

    private enum DeckChoice: String, CaseIterable, Identifiable {
        case skip, p1, p2, p3, p4, p5, ground, other
        var id: String { rawValue }
        var label: String {
            switch self {
            case .skip: return "Skip"
            case .p1: return "P1"
            case .p2: return "P2"
            case .p3: return "P3"
            case .p4: return "P4"
            case .p5: return "P5"
            case .ground: return "Ground / G"
            case .other: return "Other…"
            }
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(lotTitle)
                        .font(.headline)
                    Text("Which level are you parked on? This helps you find your car in garages and decks.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Section("Level") {
                    Picker("Level", selection: $choice) {
                        ForEach(DeckChoice.allCases) { opt in
                            Text(opt.label).tag(opt)
                        }
                    }
                    .pickerStyle(.menu)
                    if choice == .other {
                        TextField("e.g. Roof, P6", text: $otherText)
                            .textInputAutocapitalization(.characters)
                    }
                }
                if let errorText {
                    Section {
                        Text(errorText).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Deck level")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") { onFinished() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(saving || !canSave)
                }
            }
        }
    }

    private var lotTitle: String {
        lots.byId(lotId)?.shortName ?? "Lot \(lotId)"
    }

    private var canSave: Bool {
        if choice == .other { return !otherText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return true
    }

    private func labelAndKey() -> (String, String)? {
        switch choice {
        case .skip:
            return nil
        case .p1: return ("P1", DeckLevelNormalizer.normalizedKey(from: "P1"))
        case .p2: return ("P2", DeckLevelNormalizer.normalizedKey(from: "P2"))
        case .p3: return ("P3", DeckLevelNormalizer.normalizedKey(from: "P3"))
        case .p4: return ("P4", DeckLevelNormalizer.normalizedKey(from: "P4"))
        case .p5: return ("P5", DeckLevelNormalizer.normalizedKey(from: "P5"))
        case .ground: return ("Ground", DeckLevelNormalizer.normalizedKey(from: "G"))
        case .other:
            let t = otherText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !t.isEmpty else { return nil }
            return (t, DeckLevelNormalizer.normalizedKey(from: t))
        }
    }

    @MainActor
    private func save() async {
        guard let pair = labelAndKey() else {
            onFinished()
            return
        }
        saving = true
        errorText = nil
        defer { saving = false }
        do {
            try await ParkAPI.patchActiveSession(deckLevelLabel: pair.0, deckLevelKey: pair.1)
            await NativeSessionStore.shared.refresh()
            HapticManager.shared.success()
            onFinished()
        } catch {
            errorText = error.localizedDescription
            HapticManager.shared.error()
        }
    }
}
