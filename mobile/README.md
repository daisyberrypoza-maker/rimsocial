# RimSocial mobile (React Native)

This is the native app, written to mirror the website (`frontend/`) screen for screen.
Every web fix should be mirrored here too; the behaviour rules are in `docs/SCREEN-RULES.md`.

Nothing in this folder has been installed or run yet. The source was checked for syntax only,
so expect a first-run fix or two when you build it.

## Set up (once)

1. Install Node 18+, JDK 17 and the Android SDK (Android Studio is easiest).
2. Create the native project next to this folder:

   ```
   npx @react-native-community/cli@13 init RimSocialNative --version 0.75.4 --skip-install
   ```

3. Copy this `mobile/` folder's contents over the new project: `App.js`, `index.js`, `src/`,
   `package.json`, `babel.config.js`, `metro.config.js`, `app.json`. Overwrite when asked.
4. In the project, install packages:

   ```
   npm install
   ```

5. Add these permissions to `android/app/src/main/AndroidManifest.xml`, above `<application>`:

   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
   <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
   <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
   ```

6. Run it:

   ```
   npx react-native run-android
   ```

   Or build an APK with `cd android && ./gradlew assembleDebug`.

## Layout

- `App.js`: root. Stops all video when the app is minimised.
- `src/navigation/`: root stack (Login when signed out), bottom tabs (Stories, Chat, Add, Rimlight, Profile).
- `src/screens/`: one file per screen. Profile lists and Edit profile are pushed screens, so Back returns to the profile.
- `src/components/`: Icon (same names as web), Avatar, StoryRing, PostCard (Rimlight), Toast.
- `src/lib/`: playback (one video at a time), paged lists, background uploader, formatting, toast.
- `src/store.js`: zustand with AsyncStorage. Same saved data as the web app.
- `src/api.js`, `src/config.js`: same backend as the website.

## Behaviour (same as the web app)

- Opens on Stories. Every screen shows saved data at once and refreshes in the background, with no loading or error text.
- Only one video plays at a time. Leaving a screen or minimising the app stops it at once.
- Posts and stories upload in the background; the spinner shows on Rimlight or Stories.
- The bottom bar shows the active tab filled. The Rimlight bar is dark.

## Not in this first version

- Google sign-in (needs `@react-native-google-signin/google-signin`).
- Creator Studio, Business Hub, Live Broadcasts, Live Match Room, Algorithm, Ads & Sponsors,
  Recommended, Explore Watch and the profile feed. These are web-only for now.
- Video trimming to the story/post limit (needs a native trim module).
- The notification chime (`src/lib/chime.js` is a placeholder).
- Snapchat-style editor tools (pencil, stickers, music, effects).

## Backend fields to confirm on the first run

These match the web app's usage. If a screen shows nothing, check the field name first:

- `GET /v1/stories/users/:id` returns `{ items }`.
- `GET /v1/search?type=people&q=` returns `{ people }`.
- `POST /v1/users/me/avatar` expects the photo in the `media` field.
- `PUT /v1/users/me/profile` takes `displayName`, `bio`, `website`, `city`.
