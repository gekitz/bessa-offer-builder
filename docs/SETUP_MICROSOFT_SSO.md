# Microsoft Entra SSO Einrichtung — bessa CRM

## Übersicht

Für die bessa CRM App (https://bessa.kitz.co.at) benötigen wir eine
App-Registrierung in Microsoft Entra ID, damit sich unsere Mitarbeiter
mit ihrem bestehenden Microsoft 365 Konto anmelden können.

Die Authentifizierung läuft über Supabase Auth (unser Backend). Microsoft
leitet nach dem Login zurück an Supabase, das den Token verifiziert und
den Benutzer in unserer App anmeldet.

---

## Schritt 1: App-Registrierung in Microsoft Entra

1. Öffne das **Azure Portal**: https://portal.azure.com
2. Navigiere zu **Microsoft Entra ID** → **App-Registrierungen** → **Neue Registrierung**
3. Folgende Werte eintragen:

| Feld | Wert |
|------|------|
| **Name** | `bessa CRM` |
| **Unterstützte Kontotypen** | `Nur Konten in diesem Organisationsverzeichnis` (Single Tenant) |
| **Umleitungs-URI — Typ** | `Web` |
| **Umleitungs-URI — URI** | `https://uouryrnyzicdociqberq.supabase.co/auth/v1/callback` |

4. Klicke **Registrieren**

---

## Schritt 2: Client Secret erstellen

1. In der soeben erstellten App-Registrierung → **Zertifikate & Geheimnisse**
2. Klicke **Neuer geheimer Clientschlüssel**

| Feld | Wert |
|------|------|
| **Beschreibung** | `bessa CRM Supabase Auth` |
| **Gültigkeitsdauer** | `24 Monate` |

3. **WICHTIG**: Den **Wert** (Value) des Secrets sofort kopieren — er wird nur einmal angezeigt!

4. Bitte notiere und übermittle mir folgende drei Werte:

| Was | Wo zu finden |
|-----|-------------|
| **Application (client) ID** | Übersichtsseite der App-Registrierung |
| **Directory (tenant) ID** | Übersichtsseite der App-Registrierung |
| **Client Secret Value** | Soeben kopiert |

Diese drei Werte brauche ich, um die Supabase-Seite zu konfigurieren.

---

## Schritt 3: API-Berechtigungen

1. In der App-Registrierung → **API-Berechtigungen** → **Berechtigung hinzufügen**
2. Wähle **Microsoft Graph** → **Delegierte Berechtigungen**
3. Aktiviere folgende Berechtigungen:

| Berechtigung | Zweck |
|-------------|-------|
| `openid` | SSO-Basisberechtigung |
| `email` | E-Mail-Adresse des Benutzers |
| `profile` | Name und Profilbild |
| `User.Read` | Benutzerinformationen lesen |

4. Klicke **Administratorzustimmung für [Organisation] erteilen**

---

## Schritt 4: Redirect URIs vervollständigen

Unter **Authentifizierung** in der App-Registrierung bitte folgende drei
Redirect URIs eintragen (Typ jeweils **Web**):

1. **Produktion (bereits in Schritt 1 eingetragen):**
   `https://uouryrnyzicdociqberq.supabase.co/auth/v1/callback`

2. **Frontend Redirect:**
   `https://bessa.kitz.co.at`

3. **Lokale Entwicklung:**
   `http://localhost:5173`

---

## Schritt 5 (optional): Token-Konfiguration

Unter **Token-Konfiguration** → **Optionale Ansprüche hinzufügen**:

| Token-Typ | Anspruch |
|-----------|----------|
| ID | `email` |
| ID | `preferred_username` |

Dies stellt sicher, dass die E-Mail-Adresse im Token mitgeliefert wird.

---

## Zusammenfassung

Nach Abschluss aller Schritte bitte folgende Werte an kg@kitz.co.at senden:

```
Application (client) ID:  ___________________________________
Directory (tenant) ID:    ___________________________________
Client Secret Value:      ___________________________________
```

Damit konfiguriere ich die Supabase-Seite der Authentifizierung. Die App
ist danach unter https://bessa.kitz.co.at erreichbar und alle KITZ
Microsoft 365 Benutzer können sich anmelden.

---

## Technische Details (nur zur Info)

| Komponente | URL |
|-----------|-----|
| Frontend | `https://bessa.kitz.co.at` |
| Supabase Backend | `https://uouryrnyzicdociqberq.supabase.co` |
| Auth Callback | `https://uouryrnyzicdociqberq.supabase.co/auth/v1/callback` |
| Protokoll | OpenID Connect / OAuth 2.0 |
| Flow | Authorization Code Flow mit PKCE |

Bei Fragen: kg@kitz.co.at
