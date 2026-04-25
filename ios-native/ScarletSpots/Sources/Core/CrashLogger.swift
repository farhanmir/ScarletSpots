import Foundation

actor CrashLogger {
    static let shared = CrashLogger()

    private init() {}

    func capture(_ error: Error, context: String) {
        Logger.log("CrashLogger[\(context)]: \(error.localizedDescription)")
    }
}
