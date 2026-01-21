/**
 * API routes for TrainCheck.
 *
 * Groups:
 * - Auth: /auth/*
 * - Profile: /profile/*
 * - Search: /connection
 * - Timetable: /timetable/*
 * - Stats: /stats/*
 * - Admin: /admin/* (requires JWT + ADMIN)
 *
 * Extension pattern:
 * 1) Add a DB function in `server/sql/sql.js` returning a Promise
 * 2) Add an endpoint here that calls the DB function
 * 3) (Optional) Add a view in `server/sql/views.sql` for reporting queries
 */
const express = require('express');
const router = express.Router();

const db = require('./sql/sql');
const { generateToken, authenticateJWT, authorizeAdmin } = require('./middleware');

const gtfs = require('./sql/imports');

router.get('/test', (req, res) => {
  res.type('text/plain');
  res.send('tekst');
});

// AUTH
router.post('/auth/register', (req, res) => {
       const { username, password } = req.body;
       if (!username || !password) {
	       return res.status(400).json({ message: 'Brak nazwy użytkownika lub hasła' });
       }
       db.getUserByUsername(username)
	       .then(existing => {
		       if (existing) {
			       return res.status(409).json({ message: 'Użytkownik już istnieje' });
		       }
		       const user = {
			       username,
			       password, // UWAGA: plain text! Zamień na hash w produkcji
			       role: 'USER',
		       };
		       db.createUser(user)
			       .then(() => {
				       const token = generateToken(user);
				       res.status(201).json({ token, user: { username: user.username, role: user.role, id: user.username } });
			       })
			       .catch(err => {
				       res.status(500).json({ message: 'Błąd serwera', error: err.message });
			       });
	       })
	       .catch(err => {
		       res.status(500).json({ message: 'Błąd serwera', error: err.message });
	       });
});

router.post('/auth/login', (req, res) => {
       const { username, password } = req.body;
       if (!username || !password) {
	       return res.status(400).json({ message: 'Brak nazwy użytkownika lub hasła' });
       }
       db.getUserByUsername(username)
	       .then(user => {
		       if (!user || user.password !== password) {
			       return res.status(401).json({ message: 'Nieprawidłowe dane logowania' });
		       }
		       const token = generateToken(user);
		       res.json({ token, user: { username: user.username, role: user.role, id: user.username } });
	       })
	       .catch(err => {
		       res.status(500).json({ message: 'Błąd serwera', error: err.message });
	       });
});

// PROFILE
router.put('/profile/password', authenticateJWT, (req, res) => {
	const userId = (req.user.id || req.user.username); //(req.user && ) || null;
       const { newPassword } = req.body;
	if (!userId) {
		return res.status(401).json({ message: 'Brak danych użytkownika w tokenie' });
	}
       if (!newPassword) {
	       return res.status(400).json({ message: 'Brak nowego hasła' });
       }
       db.updateUserPassword(userId, newPassword)
	       .then(result => {
		       if (result.affectedRows === 1) {
			       res.json({ message: 'Hasło zmienione' });
		       } else {
			       res.status(404).json({ message: 'Użytkownik nie znaleziony' });
		       }
	       })
	       .catch(err => {
		       res.status(500).json({ message: 'Błąd serwera', error: err.message });
	       });
});

// Przykładowy odczyt danych z bazy
router.get('/stats/top-stops', (req, res) => {
	// const limit = req.query.limit;
	const limit = 10;
	db.getTopStops(limit)
		.then(rows => res.json(rows))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

router.get('/stats/agency-activity', (req, res) => {
	db.getAgencyActivity()
		.then(rows => res.json(rows))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

router.get('/stats/route-trip-counts', (req, res) => {
	db.getRouteTripCounts()
		.then(rows => res.json(rows))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

// ADMIN: GTFS import
router.post('/admin/gtfs/files/kml', authenticateJWT, authorizeAdmin, (req, res) => {
	const url = 'https://www.kolejemalopolskie.com.pl/rozklady_jazdy/kml-ska-gtfs.zip';
	gtfs.emptyFolder()
		.then(() => gtfs.download(url))
		.then(() => gtfs.extract())
		.then(() => res.json({ message: 'GTFS kml pobrany i rozpakowany' }))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

router.post('/admin/gtfs/files/pr', authenticateJWT, authorizeAdmin, (req, res) => {
	const url = 'https://mkuran.pl/gtfs/polregio.zip';
	gtfs.emptyFolder()
		.then(() => gtfs.download(url))
		.then(() => gtfs.extract())
		.then(() => res.json({ message: 'GTFS pr pobrany i rozpakowany' }))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

router.post('/admin/gtfs/truncate', authenticateJWT, authorizeAdmin, (req, res) => {
	gtfs.truncateTables()
		.then(() => res.json({ message: 'Tabele GTFS wyczyszczone' }))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

router.post('/admin/gtfs/load/all', authenticateJWT, authorizeAdmin, (req, res) => {
	gtfs.loadAgency()
		.then(() => gtfs.loadRoutes())
		.then(() => gtfs.loadCalendar())
		.then(() => gtfs.loadCalendarDates())
		.then(() => gtfs.loadTrips())
		.then(() => gtfs.loadStops())
		.then(() => gtfs.loadStopTimes())
		.then(() => res.json({ message: 'GTFS załadowany do bazy' }))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

// ADMIN: create a custom direct trip (2 stops)
router.post('/admin/custom-trip', authenticateJWT, authorizeAdmin, (req, res) => {
	const {
		route_name,
		date,
		start_station,
		end_station,
		departure_time,
		arrival_time,
	} = req.body || {};

	if (!route_name || !date || !start_station || !end_station || !departure_time || !arrival_time) {
		return res.status(400).json({
			message: 'Wymagane: route_name, date, start_station, end_station, departure_time, arrival_time',
		});
	}

	db.createCustomDirectTrip({
		route_name,
		date,
		start_station,
		end_station,
		departure_time,
		arrival_time,
	})
		.then(info => res.json({ message: 'Dodano kurs', ...info }))
		.catch(err => res.status(400).json({ message: 'Nie udało się dodać kursu', error: err.message }));
});

// Wszystkie nazwy stacji
router.get('/stops/all', (req, res) => {
	db.getAllStopNames()
		.then(names => res.json(names))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

// Tablica stacyjna: 10 najbliższych odjazdów
router.post('/timetable/departures', (req, res) => {
	const { stationName, date, time } = req.body || {};
	if (!stationName || !date || !time) {
		return res.status(400).json({ message: 'Wymagane: stationName, date, time' });
	}
	db.getNextDeparturesFromStation({ stationName, date, time, limit: 10 })
		.then(rows => res.json(rows))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

// Tablica stacyjna: 10 najbliższych przyjazdów
router.post('/timetable/arrivals', (req, res) => {
	const { stationName, date, time } = req.body || {};
	if (!stationName || !date || !time) {
		return res.status(400).json({ message: 'Wymagane: stationName, date, time' });
	}
	db.getNextArrivalsToStation({ stationName, date, time, limit: 10 })
		.then(rows => res.json(rows))
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

// Wyszukaj połączenie bezpośrednie: 10 najbliższych wyników
router.post('/connection', (req, res) => {
	const { startStation, endStation, date, time } = req.body || {};
	if (!startStation || !endStation || !date || !time) {
		return res
			.status(400)
			.json({ message: 'Wymagane: startStation, endStation, date, time' });
	}

	const normalizeName = v => String(v || '').trim().toLowerCase();
	if (normalizeName(startStation) === normalizeName(endStation)) {
		return res
			.status(400)
			.json({ message: 'Stacja początkowa i końcowa muszą być różne' });
	}

	db.getDirectConnections({ startStation, endStation, date, time, limit: 10 })
		.then(rows => {
			if (!rows || rows.length === 0) {
				return res.json({ message: 'Brak połączeń dla podanych kryteriów', connections: [] });
			}
			return res.json({ connections: rows });
		})
		.catch(err => res.status(500).json({ message: 'Błąd serwera', error: err.message }));
});

module.exports = router;