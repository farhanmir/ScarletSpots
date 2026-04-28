# TODO

## Very Important

- Configure backend APNS credentials before expecting iOS push notifications to work reliably.
  Backend env vars needed:
  `APNS_KEY_ID`
  `APNS_TEAM_ID`
  `APNS_BUNDLE_ID`
  `APNS_PRIVATE_KEY` or `APNS_PRIVATE_KEY_PATH`
  Optional:
  `APNS_USE_SANDBOX`
  `CAMPUS_TIMEZONE=America/New_York`

- Get these values from the Apple Developer account:
  `APNS_TEAM_ID`
  Source: Apple Developer account membership details.

  `APNS_KEY_ID`
  Source: Apple Developer > Certificates, Identifiers & Profiles > Keys.

  `APNS_PRIVATE_KEY`
  Source: the downloaded APNs `.p8` key file created in Apple Developer.
  Important: Apple only lets you download the `.p8` once.

  `APNS_BUNDLE_ID`
  Source: the app's iOS bundle identifier in Apple Developer / Xcode.
  It must exactly match the production iOS app bundle id.

- Apple setup steps:
  1. Have an Apple Developer account.
  2. Create or confirm the app identifier / bundle identifier.
  3. Enable Push Notifications for that app id.
  4. Create an APNs auth key.
  5. Download the `.p8`.
  6. Add the values above to backend environment variables / secrets.

- Current project note:
  Native iOS push delivery now expects APNS on the backend, not Expo-only delivery.
