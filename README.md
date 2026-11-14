# finanz-app

Offline-Finanz-App für Android (Pixel 9 Pro): Web-App in einer Capacitor-Hülle plus natives Homescreen-Widget.

- Web-Teil: `www/`
- Android-Projekt: `android/`
- Build: GitHub Actions (`.github/workflows/android.yml`). Push auf `main` baut eine Test-APK, ein Tag `finanz-vX` baut die signierte APK und legt sie als Release ab.
- Signier-Schlüssel liegt nur lokal unter `keystore/` und als GitHub-Secrets, nie im Repository.
