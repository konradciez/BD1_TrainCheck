# TrainCheck (b1_projekt)

Aplikacja webowa do importu podstawowych danych GTFS do bazy MySQL oraz ich prezentacji w formie:
- wyszukiwarki bezpośrednich połączeń (start/cel, data + godzina),
- harmonogramu stacyjnego (odjazdy/przyjazdy + stacje pośrednie),
- statystyk na bazie widoków SQL,
- panelu administratora (import GTFS + dodanie własnego kursu 2-przystankowego).

## Szybki start

### 1) Instalacja zależności

W katalogu projektu:

```bash
cd b1_projekt
npm install
```

### 2) Uruchomienie serwera

```bash
node server/server.js
```

Serwer startuje domyślnie na `http://localhost:5200`.

### 3) Uruchomienie klienta

Otwórz `b1_projekt/index.html` w przeglądarce (lub przez dowolny statyczny serwer HTTP).

## Konfiguracja

- Backend port: `5200` (zob. `server/server.js`).
- Frontend API URL: `client/api.js` (`API_URL`).
- Konfiguracja bazy MySQL: `server/sql/sql.js` (`DB_CONFIG`).

## Dokumentacja techniczna

Szczegółowa dokumentacja dla rozwoju projektu znajduje się w: `docs/TECHNICAL.md`.
