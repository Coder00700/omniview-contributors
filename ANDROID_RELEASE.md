OmniView Contributors — Android team test

Download OmniView-Contributors.apk from this release on your Android phone.
Allow installation from the browser or file manager when Android asks, then open
the APK. Android 7 or later and a current Android System WebView are required.
The GitHub repository is private: teammates need repository access to download.

The app contains the interface and saves unuploaded clips on the device. Sign in,
enable camera and precise location, record a 3–5 minute clip, then upload selected
clips or all clips. Keep the app open while recording and uploading. No microphone
or SMS permission is needed on contributors' phones; only the separate gateway
phone needs SMS permission.

The Render API handles upload reservations and SMS delivery hooks. Supabase handles
accounts and metadata; B2 stores temporary videos. Credentials for those servers
are not included in the APK. The Supabase public application key is intentionally
included; account isolation is enforced by authentication and database policies.

This is an initial team-test build. Automated web/API tests and the Android build
are checked; physical camera/GPS, OAuth app return, and the full phone OTP flow
must also be tested on a real Android device. Save or upload pending footage before
uninstalling: Android removes the app's local recordings when it is uninstalled.

This update adds Profile (editable name, preferences, logout), one-second requested
GPS updates with coverage screening, corrected recording-start timing, MP4
preference/WebM duration repair, and filename extensions. Rotation ends the clip.

Install this version once to enable automatic update checks. Later releases show
Update now when opened, with a manual check in Profile. Android still requires
opening the downloaded APK and approving installation. APK updates use the same
signing key and preserve app data; do not uninstall to update.
