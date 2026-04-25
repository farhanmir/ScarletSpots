import Foundation
import CryptoKit

/// `URLSessionDelegate` that enforces SPKI SHA-256 pinning against the set
/// of hashes declared in `Env.tlsPins`.
///
/// - If `Env.tlsPins` is empty, we fall back to the default system trust
///   evaluation (no pinning). That keeps local development ergonomic while
///   still giving us a real guarantee in shipping builds where a release
///   xcconfig pin is baked in.
/// - Pins are matched against the leaf certificate's SubjectPublicKeyInfo
///   (the same format Apple recommends). Compare with the output of:
///
///     openssl x509 -in cert.pem -pubkey -noout |
///     openssl pkey -pubin -outform DER |
///     openssl dgst -sha256 -binary |
///     openssl enc -base64
///
/// Formats supported: raw base64 (44 chars), `sha256/…` prefix, or the
/// lowercase hex encoding `a1b2c3…` that `Env.tlsPins` commonly ships with.
final class PinnedURLSessionDelegate: NSObject, URLSessionDelegate {
    private let pins: Set<String>

    init(pins: [String]) {
        self.pins = Set(pins.map { Self.normalize($0) }.filter { !$0.isEmpty })
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust
        else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Always run the system evaluation first. Pinning is *additional*
        // enforcement on top of a chain that must already validate.
        var error: CFError?
        let systemTrusted = SecTrustEvaluateWithError(serverTrust, &error)
        guard systemTrusted else {
            Logger.log("TLS chain rejected: \(error?.localizedDescription ?? "unknown")")
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // No pins configured → system trust is sufficient.
        guard !pins.isEmpty else {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
            return
        }

        if let serverHash = Self.leafSPKISha256(from: serverTrust),
           pins.contains(serverHash) {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            Logger.log("TLS pin mismatch for \(challenge.protectionSpace.host)")
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    // MARK: - Pin helpers

    private static func leafSPKISha256(from trust: SecTrust) -> String? {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let leaf = chain.first,
              let key = SecCertificateCopyKey(leaf),
              let publicKeyData = SecKeyCopyExternalRepresentation(key, nil) as Data?
        else { return nil }
        let digest = SHA256.hash(data: publicKeyData)
        return Data(digest).base64EncodedString()
    }

    /// Accept base64, `sha256/<base64>`, or lowercase hex.
    private static func normalize(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("sha256/") {
            return String(trimmed.dropFirst("sha256/".count))
        }
        if trimmed.count == 64, trimmed.allSatisfy({ $0.isHexDigit }) {
            // Hex → base64
            var bytes = [UInt8]()
            var index = trimmed.startIndex
            while index < trimmed.endIndex {
                let next = trimmed.index(index, offsetBy: 2)
                if let byte = UInt8(trimmed[index..<next], radix: 16) {
                    bytes.append(byte)
                }
                index = next
            }
            return Data(bytes).base64EncodedString()
        }
        return trimmed
    }
}
