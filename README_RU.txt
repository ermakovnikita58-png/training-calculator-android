FORGE Training 10 — Android source project, 30 October 2026

This is not a precompiled APK. GitHub Actions builds debug APK using Android SDK 36,
AGP 8.13.2 and Gradle 8.13. A signed release AAB/APK is available only after
supplying the upload keystore secrets in the repository.

MAIN FILES: app/src/main/assets/index.html, .github/workflows/build.yml,
app/src/main/java/ru/trainingcalculator/app/MainActivity.kt.

Functionality: workout log, programs, 30-week cycles, 556 names/variants in catalog,
nutrition, food scans via internet, 1RM/5RM, stats, JSON/CSV, own recipes.
Cloud sign-in is optional and requires your own Supabase project, SQL and Auth setup.
Google OAuth is for published HTTPS PWA only; Android WebView uses email/password.

The applicationId currently retains ru.trainingcalculator.app for compatibility
with earlier versions. Verify ownership and uniqueness before first Play release.

README_ТЕЛЕФОН.md + ОБЛАКО_НАСТРОЙКА.md in the release-kit ZIP provide steps.
Installation: build APK via GitHub Actions; HTML/PWA saves data in a different
origin, migrate using JSON export/import. Never include signing keystores or service
role credentials in source ZIP, browser app or publicly readable GitHub files.
