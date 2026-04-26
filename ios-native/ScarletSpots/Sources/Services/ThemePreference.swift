import Foundation
import SwiftUI

enum ThemePreference {
    static let key = "theme_mode_v1"

    static func colorScheme(for mode: String) -> ColorScheme? {
        switch mode {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }
}
