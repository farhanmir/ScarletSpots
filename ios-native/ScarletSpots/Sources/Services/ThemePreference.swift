import Foundation
import SwiftUI

@MainActor
final class ThemePreference: ObservableObject {
    static let shared = ThemePreference()
    @Published var mode: String {
        didSet { UserDefaults.standard.set(mode, forKey: key) }
    }
    private let key = "theme_mode_v1"

    private init() {
        mode = UserDefaults.standard.string(forKey: key) ?? "system"
    }

    var colorScheme: ColorScheme? {
        switch mode {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }
}
