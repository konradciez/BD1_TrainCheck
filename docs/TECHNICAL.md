# Dokumentacja techniczna (punkt 18)

Ten dokument opisuje architekturę i kod projektu TrainCheck tak, aby umożliwić dalszą rozbudowę.

## 1. Stos technologiczny

- **Frontend:** HTML + CSS + JavaScript (bez frameworka), dynamiczne renderowanie widoków.
- **Backend:** Node.js + Express.
- **Baza danych:** MySQL.
- **Autoryzacja:** JWT (nagłówek `Authorization: Bearer <token>`).

## 2. Struktura katalogów

- `client/`
  - `api.js` – logika UI, renderowanie zakładek, wywołania `fetch()` do API.
  - `jwt.js` – zapis/odczyt JWT, `getCurrentUser()`, `isLoggedIn()`.
  - `style.css` – style UI.
- `server/`
  - `server.js` – konfiguracja Express, CORS, start serwera.
  - `routes.js` – definicje endpointów REST.
  - `middleware.js` – generowanie tokenów, `authenticateJWT`, `authorizeAdmin`.
  - `sql/`
    - `sql.js` – połączenie z MySQL + funkcje dostępu do danych (Promise + `.then()`).
    - `imports.js` – pobieranie/rozpakowanie GTFS i `LOAD DATA LOCAL INFILE`.
    - `views.sql` – widoki (raporty + uproszczenie zapytań).
    - `triggers.sql` – walidacje przy insertach (np. dla custom-trip).

## 3. Uruchamianie

### Backend

```bash
cd b1_projekt
node server/server.js
```

Serwer działa na porcie `5200`.

### Frontend

Otwórz `b1_projekt/index.html` w przeglądarce.

**Uwaga:** `client/api.js` ma stałe `API_URL = 'http://localhost:5200'`. Jeśli backend działa na innym hoście/porcie, należy to zmienić.

## 4. Konfiguracja bazy danych

Konfiguracja połączenia z MySQL jest w `server/sql/sql.js` w obiekcie `DB_CONFIG`.

- W projekcie uczelnianym często jest to baza zdalna.
- W praktycznych wdrożeniach zaleca się przeniesienie danych dostępowych do zmiennych środowiskowych (ENV) oraz użycie hashowania haseł użytkowników.

## 5. Warstwa danych (MySQL)

### 5.1 Tabele GTFS

Projekt używa podstawowych encji GTFS:
- `agency`, `routes`, `trips`, `stops`, `stop_times`, `calendar`, `calendar_dates`.

### 5.2 Widoki

`server/sql/views.sql` zawiera widoki wykorzystywane przez backend do raportów i prezentacji:
- `v_departures`, `v_arrivals`, `v_trip_stops` (harmonogram, połączenia)
- `v_agency_activity`, `v_route_trip_count` (statystyki)

Aby statystyki działały, widoki muszą zostać utworzone w bazie (jednorazowo):

```sql
SOURCE server/sql/views.sql;
```

### 5.3 Triggery

`server/sql/triggers.sql` zawiera triggery walidujące inserty, szczególnie przy ręcznym dodawaniu kursów (custom-trip).

Włączyć triggery (jednorazowo):

```sql
SOURCE server/sql/triggers.sql;
```

## 6. Backend (Express)

### 6.1 Główne komponenty

- `server/server.js`: konfiguruje CORS, parsowanie JSON i podłącza router.
- `server/routes.js`: endpointy aplikacji.
- `server/middleware.js`: JWT i kontrola roli.
- `server/sql/sql.js`: funkcje DB; większość endpointów jest cienką warstwą nad tym modułem.

### 6.2 Endpointy (skrót)

**Auth**
- `POST /auth/register` – tworzy konto i zwraca JWT.
- `POST /auth/login` – logowanie i JWT.

**Profil**
- `PUT /profile/password` – zmiana hasła; wymaga JWT.

**Dane słownikowe**
- `GET /stops/all` – lista nazw stacji (do datalist w UI).

**Wyszukiwarka**
- `POST /connection` – 10 najbliższych połączeń bezpośrednich.

**Harmonogram stacyjny**
- `POST /timetable/departures`
- `POST /timetable/arrivals`

**Statystyki**
- `GET /stats/top-stops`
- `GET /stats/agency-activity`
- `GET /stats/route-trip-counts`

**Admin (JWT + rola ADMIN)**
- `POST /admin/gtfs/files/kml` – pobierz i rozpakuj GTFS.
- `POST /admin/gtfs/files/pr` – pobierz i rozpakuj GTFS.
- `POST /admin/gtfs/truncate` – wyczyść tabele GTFS.
- `POST /admin/gtfs/load/all` – import wszystkich tabel GTFS.
- `POST /admin/custom-trip` – dodanie własnego kursu 2-przystankowego.

## 7. Import GTFS

Import odbywa się w module `server/sql/imports.js`:
1. pobranie zip (axios stream),
2. rozpakowanie (unzipper),
3. `LOAD DATA LOCAL INFILE` do tabel.

Ważne założenie: pliki GTFS mogą mieć różne kolumny – importer czyta nagłówek i ładuje tylko podstawowe pola (resztę mapuje do zmiennych `@...`).

## 8. Frontend (UI)

### 8.1 Renderowanie

`client/api.js` renderuje UI w kontenerach z `index.html`:
- `navbar` – zakładki,
- `options0/options1` – formularze,
- `content0/content1/result` – wyniki.

Nawigacja używa:
- `clearViews()` – czyści wszystkie sekcje przed wyrenderowaniem nowego widoku,
- `setActiveTab(key)` – oznacza aktywną zakładkę.

### 8.2 Rola ADMIN

Zakładki adminowe (np. „Admin”, „Dodaj trasę”) są pokazywane tylko gdy token JWT zawiera `role=ADMIN`.

## 9. Jak dodać nową funkcję (wzorzec rozbudowy)

1. **SQL / DB:**
   - jeśli to raport, rozważ stworzenie widoku w `server/sql/views.sql`.
   - jeśli to logika, dodaj funkcję w `server/sql/sql.js` (zwraca Promise).
2. **API:**
   - dodaj endpoint w `server/routes.js`.
   - podepnij middleware (`authenticateJWT`, `authorizeAdmin`) gdy potrzeba.
3. **UI:**
   - dodaj nową zakładkę w `renderNavbar()` w `client/api.js`.
   - dodaj funkcję renderującą formularz i wywołującą endpoint przez `fetch()`.

## 10. Uwagi bezpieczeństwa (na potrzeby projektu)

- Hasła użytkowników w projekcie są przechowywane w bazie w formie jawnej (plain text). W produkcji należy użyć hashowania (np. bcrypt) i migracji bazy.
- Sekret JWT powinien być trzymany w zmiennych środowiskowych, nie na stałe w kodzie.
