# finanz-app

Offline-Finanz-App für Android (Pixel 9 Pro): Web-App in einer Capacitor-Hülle plus natives Homescreen-Widget.

- Web-Teil: `www/`
- Android-Projekt: `android/`
- Build: GitHub Actions (`.github/workflows/android.yml`). Jeder Push auf `main` baut die APK. Steht in `version.txt` eine neue Nummer (`finanz-vX`), wird sie signiert als Release abgelegt.
- Signier-Schlüssel liegt nur lokal unter `keystore/` und als GitHub-Secrets, nie im Repository.
