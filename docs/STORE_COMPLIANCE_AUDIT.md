# Store compliance audit

Audit baseline: 2026-11-26. This document distinguishes repository evidence from items that still need product, operator, or store-console work. A successful build is not an App Store or Play policy approval.

## Configured in this change

- Shared app metadata records the existing Android application ID, `com.clipverse.app`, as the iOS bundle identifier and enables iPad support.
- iOS camera, microphone, photo-library read/write purpose strings and the non-exempt-encryption declaration are defined in `mobile/app.json`.
- The Capacitor Android manifest declares camera and microphone only. Selected photo/video access is left to the platform picker instead of requesting broad media-library permissions.
- An unsigned macOS iOS simulator workflow generates a React Native 0.75.4 native project, applies the checked-in mobile source and metadata, verifies iPhone+iPad target family, and runs `xcodebuild` with code signing disabled.

## Repository audit findings — not yet compliant

- **Account deletion:** No authenticated in-app account deletion endpoint or settings flow was found. Do not treat logout or deleting a conversation as account deletion.
- **Terms/EULA:** Signup screens display a sentence saying the user agrees to Terms and Privacy Policy, but no working terms/privacy links, persisted acceptance record or pre-publication UGC gate was found. The app must present the applicable terms and record acceptance before a user first publishes UGC.
- **Message reporting:** Post and profile reporting routes/UI exist. A dedicated report action for abusive direct messages was not verified.
- **Moderation operations:** Reporting persistence exists, but the release tracker still calls out the moderation review queue, enforcement history and appeals as incomplete. Blocking is implemented and blocked users are excluded from multiple discovery/content paths; end-to-end regression tests are still required.
- **Native iOS target:** The repository has no committed `ios/` project or Capacitor iOS directory. The new workflow compiles a generated temporary React Native iOS project using the checked-in JS source; it does not create a maintained native iOS project in the repository. The Capacitor frontend login exposes Google sign-in when its OAuth client ID is configured. The separate React Native mobile login currently displays a notice rather than implementing Google sign-in. If the iOS binary ships the Capacitor frontend with Google sign-in enabled, assess Guideline 4.8 and provide Sign in with Apple unless an exception applies.
- **Tablet and safe areas:** React Native screens use safe-area insets in several places, but a full 768–1024px tablet and physical notch/home-indicator audit has not been completed.
- **Sign in with Apple:** The mobile README says Google sign-in is not implemented in the React Native app. The web authentication providers and any iOS third-party login availability must be checked before submission; if third-party social login is offered in the iOS app, implement Sign in with Apple or document a valid Guideline 4.8 exception.
 
## Manual release actions

- Publish and link a public Privacy Policy and Terms/EULA URL; ensure in-app links work without signing in.
- Implement and test in-app account deletion, including backend data deletion/retention behavior and any required external deletion-request URL.
- Implement and test message reporting, moderation review, user blocking across feeds, search, stories, comments, groups and DMs, and safety escalation/contact details.
- Complete Apple App Privacy disclosures and Google Play Data Safety declarations to match actual collection, sharing, retention, deletion and SDK behavior.
- Complete Play Console UGC declarations, child-safety/target-audience settings, content rating, app access instructions and any required testing declarations.
- Verify whether Google sign-in or another third-party login is enabled in the iOS app; if so, implement Sign in with Apple unless a documented Guideline 4.8 exception applies. The standalone React Native login does not implement Google sign-in; confirm the Capacitor login configuration for the submitted iOS binary.
- Create/maintain a real iOS project, configure signing, app capabilities, bundle registration, screenshots, age rating, export compliance and TestFlight review.
- Run physical-device tests for camera/microphone/photo permissions, safe areas, iPad layouts, account deletion, reporting, blocking and UGC terms acceptance before submission.
