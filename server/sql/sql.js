/**
 * MySQL access layer for TrainCheck.
 *
 * Conventions:
 * - functions return Promises and are consumed with `.then()` chains in routes
 * - heavy read logic can be expressed via SQL views defined in `views.sql`
 * - GTFS service validity uses calendar + calendar_dates (add/remove exceptions)
 */
const mysql = require('mysql');
const path = require('path');

// Load environment variables (safe to call multiple times)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const DB_CONFIG = {
	host: process.env.DB_HOST || 'mysql.agh.edu.pl',
	port: Number(process.env.DB_PORT) || 3306,
	user: process.env.DB_USER || 'kciezadl',
	password: process.env.DB_PASSWORD || '',
	database: process.env.DB_NAME || 'kciezadl',
	charset: process.env.DB_CHARSET || 'utf8mb4',
	localInfile: String(process.env.DB_LOCAL_INFILE || 'true').toLowerCase() === 'true',
	multipleStatements: String(process.env.DB_MULTIPLE_STATEMENTS || 'true').toLowerCase() === 'true',
};

if (!DB_CONFIG.password) {
	console.log('Warning: DB_PASSWORD is not set (empty password).');
}

const con = mysql.createConnection(DB_CONFIG);

con.connect(err => {
	if (err) {
		console.log('error:', err);
		return;
	}
	console.log('mysql connected');
});

function normalizeDateInput(raw) {
	const s = String(raw || '').trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
	if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
	throw new Error('Invalid date format');
}

function serviceActiveWhere(serviceIdExpr) {
	// active_on_date = (calendar base service OR calendar_dates exception_type=1) AND NOT exception_type=2
	return [
		'AND (',
		'  (',
		'    (',
		'      EXISTS (',
		'        SELECT 1 FROM calendar c',
		`        WHERE c.service_id = ${serviceIdExpr}`,
		'          AND ? BETWEEN c.start_date AND c.end_date',
		'          AND CASE DAYOFWEEK(?)',
		'            WHEN 1 THEN c.sunday',
		'            WHEN 2 THEN c.monday',
		'            WHEN 3 THEN c.tuesday',
		'            WHEN 4 THEN c.wednesday',
		'            WHEN 5 THEN c.thursday',
		'            WHEN 6 THEN c.friday',
		'            WHEN 7 THEN c.saturday',
		'          END = 1',
		'      )',
		'      OR EXISTS (',
		'        SELECT 1 FROM calendar_dates cd_add',
		`        WHERE cd_add.service_id = ${serviceIdExpr}`,
		'          AND cd_add.date = ?',
		'          AND cd_add.exception_type = 1',
		'      )',
		'    )',
		'    AND NOT EXISTS (',
		'      SELECT 1 FROM calendar_dates cd_rem',
		`      WHERE cd_rem.service_id = ${serviceIdExpr}`,
		'        AND cd_rem.date = ?',
		'        AND cd_rem.exception_type = 2',
		'    )',
		'  )',
		')'
	].join('\n');
}

function createUser(user) {
	return new Promise((resolve, reject) => {
		const { username, password, role = 'USER' } = user;
		con.query(
			'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
			[username, password, role],
			(err, result) => {
				if (err) return reject(err);
				resolve(result);
			}
		);
	});
}

function getUserByUsername(username) {
	return new Promise((resolve, reject) => {
		con.query(
			'SELECT username, password, role FROM users WHERE username = ? LIMIT 1',
			[username],
			(err, rows) => {
				if (err) return reject(err);
				resolve(rows && rows.length ? rows[0] : null);
			}
		);
	});
}

function getAllUsers() {
	return new Promise((resolve, reject) => {
		con.query(
			'SELECT username, role FROM users ORDER BY username ASC',
			(err, rows) => {
				if (err) return reject(err);
				resolve(rows);
			}
		);
	});
}

function deleteUser(username) {
	return new Promise((resolve, reject) => {
		con.query(
			'DELETE FROM users WHERE username = ?',
			[username],
			(err, result) => {
				if (err) return reject(err);
				resolve(result);
			}
		);
	});
}

function updateUserPassword(username, newPassword) {
	return new Promise((resolve, reject) => {
		con.query(
			'UPDATE users SET password = ? WHERE username = ?',
			[newPassword, username],
			(err, result) => {
				if (err) return reject(err);
				resolve(result);
			}
		);
	});
}

function getTopStops(limit = 10) {
	return new Promise((resolve, reject) => {
		const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
		con.query(
			[
				'SELECT s.stop_name,',
				'       COUNT(*) AS usage_count',
				'FROM stop_times st',
				'JOIN stops s ON st.stop_id = s.stop_id',
				'GROUP BY s.stop_id, s.stop_name',
				'ORDER BY usage_count DESC',
				'LIMIT ?;',
			].join('\n'),
			[safeLimit],
			(err, rows) => {
				if (err) return reject(err);
				resolve(rows);
			}
		);
	});
}

function getAgencyActivity() {
	return new Promise((resolve, reject) => {
		con.query(
			[
				'SELECT agency_id, agency_name, trip_count',
				'FROM v_agency_activity',
				'ORDER BY trip_count DESC, agency_name ASC',
			].join('\n'),
			(err, rows) => {
				if (err) return reject(err);
				resolve(rows || []);
			}
		);
	});
}

function getRouteTripCounts() {
	return new Promise((resolve, reject) => {
		con.query(
			[
				'SELECT route_id, route_long_name, trip_count',
				'FROM v_route_trip_count',
				'ORDER BY trip_count DESC, route_long_name ASC, route_id ASC',
			].join('\n'),
			(err, rows) => {
				if (err) return reject(err);
				resolve(rows || []);
			}
		);
	});
}

function getAllStopNames() {
	return new Promise((resolve, reject) => {
		con.query(
			'SELECT DISTINCT stop_name FROM stops ORDER BY stop_name ASC',
			(err, rows) => {
				if (err) return reject(err);
				resolve(rows.map(r => r.stop_name));
			}
		);
	});
}

function getNextDeparturesFromStation({ stationName, date, time, limit = 10 }) {
	return new Promise((resolve, reject) => {
		const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
		const name = String(stationName || '').trim();
		const dateStr = String(date || '').trim();
		const timeStr = String(time || '').trim();
		const normalizeName = v => String(v || '').trim().toLowerCase();
		const requestedStationNorm = normalizeName(name);

		if (!name || !dateStr || !timeStr) {
			return reject(new Error('stationName, date, time are required'));
		}

		dateIso = normalizeDateInput(dateStr);

		const parts = timeStr.split(':').map(x => Number(x));
		const hours = parts[0];
		const minutes = parts[1];
		const seconds = parts.length >= 3 ? parts[2] : 0;
		if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
			return reject(new Error('Invalid time format'));
		}
		const minSec = hours * 3600 + minutes * 60 + seconds;

		const sqlTrips = [
			'SELECT',
			'  d.trip_id AS trip_id,',
			'  r.route_long_name AS route_long_name,',
			'  d.departure_time AS departure_time,',
			'  d.stop_sequence AS origin_seq',
			'FROM v_departures d',
			'JOIN routes r ON r.route_id = d.route_id',
			'WHERE d.stop_name = ?',
			'  AND TIME_TO_SEC(d.departure_time) >= ?',
			serviceActiveWhere('d.service_id'),
			'ORDER BY TIME_TO_SEC(departure_time) ASC',
			'LIMIT ?',
		].join('\n');

		con.query(sqlTrips, [name, minSec, dateIso, dateIso, dateIso, dateIso, safeLimit], (err, tripRows) => {
			if (err) return reject(err);
			if (!tripRows || !tripRows.length) return resolve([]);

			const tripIds = tripRows.map(r => r.trip_id);
			const originSeqByTrip = new Map(tripRows.map(r => [r.trip_id, Number(r.origin_seq)]));
			const routeByTrip = new Map(tripRows.map(r => [r.trip_id, {
				route_id: r.route_id,
				route_long_name: r.route_long_name,
				route_short_name: r.route_short_name,
			}]));
			const depByTrip = new Map(tripRows.map(r => [r.trip_id, r.departure_time]));

			const sqlStops = [
				'SELECT',
				'  trip_id,',
				'  stop_sequence,',
				'  stop_name',
				'FROM v_trip_stops',
				'WHERE trip_id IN (?)',
				'ORDER BY trip_id ASC, stop_sequence ASC',
			].join('\n');

			con.query(sqlStops, [tripIds], (err, stopRows) => {
				if (err) return reject(err);

				const byTrip = new Map();
				for (const row of stopRows) {
					if (!byTrip.has(row.trip_id)) byTrip.set(row.trip_id, []);
					byTrip.get(row.trip_id).push({
						seq: Number(row.stop_sequence),
						name: row.stop_name,
					});
				}

				const result = tripIds
					.map(tripId => {
					const stops = byTrip.get(tripId) || [];
					const originSeq = originSeqByTrip.get(tripId);
					const lastSeq = stops.length ? stops[stops.length - 1].seq : null;
					const destination = stops.length ? stops[stops.length - 1].name : null;
					const intermediateStops = stops
						.filter(s => lastSeq !== null && s.seq > originSeq && s.seq < lastSeq)
						.map(s => s.name);

					return {
						trip_id: tripId,
						route_id: routeByTrip.get(tripId)?.route_id,
						route_long_name: routeByTrip.get(tripId)?.route_long_name,
						route_short_name: routeByTrip.get(tripId)?.route_short_name,
						departure_time: depByTrip.get(tripId),
						destination,
						intermediate_stops: intermediateStops,
					};
				})
					// A -> A
					.filter(row => normalizeName(row.destination) !== requestedStationNorm);

				resolve(result);
			});
		});
	});
}

function getNextArrivalsToStation({ stationName, date, time, limit = 10 }) {
	return new Promise((resolve, reject) => {
		const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
		const name = String(stationName || '').trim();
		const dateStr = String(date || '').trim();
		const timeStr = String(time || '').trim();
		const normalizeName = v => String(v || '').trim().toLowerCase();
		const requestedStationNorm = normalizeName(name);

		if (!name || !dateStr || !timeStr) {
			return reject(new Error('stationName, date, time are required'));
		}

		dateIso = normalizeDateInput(dateStr);

		const parts = timeStr.split(':').map(x => Number(x));
		const hours = parts[0];
		const minutes = parts[1];
		const seconds = parts.length >= 3 ? parts[2] : 0;
		if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
			return reject(new Error('Invalid time format'));
		}
		const minSec = hours * 3600 + minutes * 60 + seconds;

		const sqlTrips = [
			'SELECT',
			'  a.trip_id AS trip_id,',
			'  r.route_long_name AS route_long_name,',
			'  a.arrival_time AS arrival_time,',
			'  a.stop_sequence AS target_seq',
			'FROM v_arrivals a',
			'JOIN routes r ON r.route_id = a.route_id',
			'WHERE a.stop_name = ?',
			'  AND TIME_TO_SEC(a.arrival_time) >= ?',
			serviceActiveWhere('a.service_id'),
			'ORDER BY TIME_TO_SEC(arrival_time) ASC',
			'LIMIT ?',
		].join('\n');

		con.query(sqlTrips, [name, minSec, dateIso, dateIso, dateIso, dateIso, safeLimit], (err, tripRows) => {
			if (err) return reject(err);
			if (!tripRows || !tripRows.length) return resolve([]);

			const tripIds = tripRows.map(r => r.trip_id);
			const targetSeqByTrip = new Map(tripRows.map(r => [r.trip_id, Number(r.target_seq)]));
			const routeByTrip = new Map(tripRows.map(r => [r.trip_id, {
				route_id: r.route_id,
				route_long_name: r.route_long_name,
				route_short_name: r.route_short_name,
			}]));
			const arrByTrip = new Map(tripRows.map(r => [r.trip_id, r.arrival_time]));

			const sqlStops = [
				'SELECT',
				'  trip_id,',
				'  stop_sequence,',
				'  stop_name',
				'FROM v_trip_stops',
				'WHERE trip_id IN (?)',
				'ORDER BY trip_id ASC, stop_sequence ASC',
			].join('\n');

			con.query(sqlStops, [tripIds], (err, stopRows) => {
				if (err) return reject(err);

				const byTrip = new Map();
				for (const row of stopRows) {
					if (!byTrip.has(row.trip_id)) byTrip.set(row.trip_id, []);
					byTrip.get(row.trip_id).push({
						seq: Number(row.stop_sequence),
						name: row.stop_name,
					});
				}

				const result = tripIds
					.map(tripId => {
					const stops = byTrip.get(tripId) || [];
					const targetSeq = targetSeqByTrip.get(tripId);
					const origin = stops.length ? stops[0].name : null;
					const originSeq = stops.length ? stops[0].seq : null;
					const intermediateStops = stops
						.filter(s => originSeq !== null && s.seq > originSeq && s.seq < targetSeq)
						.map(s => s.name);

					return {
						trip_id: tripId,
						route_id: routeByTrip.get(tripId)?.route_id,
						route_long_name: routeByTrip.get(tripId)?.route_long_name,
						route_short_name: routeByTrip.get(tripId)?.route_short_name,
						arrival_time: arrByTrip.get(tripId),
						origin,
						intermediate_stops: intermediateStops,
					};
				})
					//A -> A
					.filter(row => normalizeName(row.origin) !== requestedStationNorm);

				resolve(result);
			});
		});
	});
}

function getDirectConnections({ startStation, endStation, date, time, limit = 10 }) {
	return new Promise((resolve, reject) => {
		const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
		const start = String(startStation || '').trim();
		const end = String(endStation || '').trim();
		const dateStr = String(date || '').trim();
		const timeStr = String(time || '').trim();

		if (!start || !end || !dateStr || !timeStr) {
			return reject(new Error('startStation, endStation, date, time are required'));
		}

		dateIso = normalizeDateInput(dateStr);

		const parts = timeStr.split(':').map(x => Number(x));
		const hours = parts[0];
		const minutes = parts[1];
		const seconds = parts.length >= 3 ? parts[2] : 0;
		if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
			return reject(new Error('Invalid time format'));
		}
		const minSec = hours * 3600 + minutes * 60 + seconds;

		const sql = [
			'SELECT',
			'  ? AS departure_date,',
			'  d.departure_time AS departure_time,',
			'  a.arrival_time AS arrival_time,',
			'  d.route_id AS route_id,',
			'  r.route_long_name AS route_long_name,',
			'  r.route_short_name AS route_short_name,',
			'  d.trip_id AS trip_id,',
			'  SEC_TO_TIME(TIME_TO_SEC(a.arrival_time) - TIME_TO_SEC(d.departure_time)) AS travel_time',
			'FROM v_departures d',
			'JOIN v_arrivals a ON d.trip_id = a.trip_id',
			'JOIN routes r ON r.route_id = d.route_id',
			'WHERE d.stop_name = ?',
			'  AND a.stop_name = ?',
			'  AND d.stop_sequence < a.stop_sequence',
			'  AND TIME_TO_SEC(d.departure_time) >= ?',
			serviceActiveWhere('d.service_id'),
			'ORDER BY TIME_TO_SEC(d.departure_time) ASC',
			'LIMIT ?',
		].join('\n');

		con.query(
			sql,
			[dateIso, start, end, minSec, dateIso, dateIso, dateIso, dateIso, safeLimit],
			(err, rows) => {
			if (err) return reject(err);
			resolve(rows || []);
		}
		);
	});
}

function insertCustomAgency() {
	return new Promise((resolve, reject) => {
		con.query(
			[
				'INSERT INTO agency (agency_id, agency_name, agency_url, agency_timezone)',
				"VALUES ('custom', 'custom', 'custom', 'Europe/Warsaw')",
				'ON DUPLICATE KEY UPDATE agency_id = agency_id',
			].join('\n'),
			err => {
				if (err) return reject(err);
				resolve(true);
			}
		);
	});
}

function upsertCustomRoute({ route_id, route_long_name }) {
	return new Promise((resolve, reject) => {
		const routeId = String(route_id || '').trim();
		const routeLongName = String(route_long_name || '').trim();
		if (!routeId) return reject(new Error('Brak route_id'));

		con.query(
			[
				'INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name, route_type)',
				'VALUES (?, ?, ?, ?, ?)',
				'ON DUPLICATE KEY UPDATE route_long_name = VALUES(route_long_name)',
			].join('\n'),
			[routeId, 'custom', 'custom', routeLongName || routeId, 2],
			err => {
				if (err) return reject(err);
				resolve(true);
			}
		);
	});
}

function insertTrip({ trip_id, route_id, service_id }) {
	return new Promise((resolve, reject) => {
		const tripId = String(trip_id || '').trim();
		const routeId = String(route_id || '').trim();
		const serviceId = String(service_id || '').trim();
		if (!tripId || !routeId || !serviceId) {
			return reject(new Error('Brak trip_id/route_id/service_id'));
		}
		con.query(
			'INSERT INTO trips (trip_id, route_id, service_id) VALUES (?, ?, ?)',
			[tripId, routeId, serviceId],
			err => {
				if (err) return reject(err);
				resolve(true);
			}
		);
	});
}

function upsertCalendarDate({ service_id, date, exception_type = 1 }) {
	return new Promise((resolve, reject) => {
		const serviceId = String(service_id || '').trim();
		let dateIso;
		try {
			dateIso = normalizeDateInput(date);
		} catch (e) {
			return reject(e);
		}
		const ex = Number(exception_type) || 1;
		if (!serviceId) return reject(new Error('Brak service_id'));
		con.query(
			[
				'INSERT INTO calendar_dates (service_id, date, exception_type)',
				'VALUES (?, ?, ?)',
				'ON DUPLICATE KEY UPDATE exception_type = VALUES(exception_type)',
			].join('\n'),
			[serviceId, dateIso, ex],
			err => {
				if (err) return reject(err);
				resolve(true);
			}
		);
	});
}

function getStopIdByName(stop_name) {
	return new Promise((resolve, reject) => {
		const name = String(stop_name || '').trim();
		if (!name) return reject(new Error('Brak stop_name'));
		con.query(
			'SELECT stop_id FROM stops WHERE stop_name = ? ORDER BY stop_id ASC LIMIT 1',
			[name],
			(err, rows) => {
				if (err) return reject(err);
				if (!rows || !rows.length) return reject(new Error(`Nie ma takiej stacji: ${name}`));
				resolve(rows[0].stop_id);
			}
		);
	});
}

function insertTwoStopTimes({ trip_id, start_stop_id, end_stop_id, departure_time, arrival_time }) {
	return new Promise((resolve, reject) => {
		const tripId = String(trip_id || '').trim();
		const startStopId = String(start_stop_id || '').trim();
		const endStopId = String(end_stop_id || '').trim();
		const depTime = String(departure_time || '').trim();
		const arrTime = String(arrival_time || '').trim();
		if (!tripId || !startStopId || !endStopId || !depTime || !arrTime) {
			return reject(new Error('Brak danych do stop_times'));
		}
		con.query(
			[
				'INSERT INTO stop_times (trip_id, stop_sequence, arrival_time, departure_time, stop_id)',
				'VALUES',
				'  (?, 1, ?, ?, ?),',
				'  (?, 2, ?, ?, ?)',
			].join('\n'),
			[tripId, depTime, depTime, startStopId, tripId, arrTime, arrTime, endStopId],
			err => {
				if (err) return reject(err);
				resolve(true);
			}
		);
	});
}

function timeToSec(t) {
	const parts = String(t || '').trim().split(':').map(v => Number(v));
	const h = parts[0];
	const m = parts[1];
	const s = parts.length >= 3 ? parts[2] : 0;
	if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return NaN;
	return h * 3600 + m * 60 + s;
}

function createCustomDirectTripInsert({
	route_id,
	route_long_name,
	trip_id,
	service_id,
	date,
	start_station,
	end_station,
	departure_time,
	arrival_time,
}) {
	return insertCustomAgency()
		.then(() => upsertCustomRoute({ route_id, route_long_name: route_long_name || route_id }))
		.then(() => insertTrip({ trip_id, route_id, service_id }))
		.then(() => upsertCalendarDate({ service_id, date, exception_type: 1 }))
		.then(() => Promise.all([getStopIdByName(start_station), getStopIdByName(end_station)]))
		.then(([startStopId, endStopId]) =>
			insertTwoStopTimes({
				trip_id,
				start_stop_id: startStopId,
				end_stop_id: endStopId,
				departure_time,
				arrival_time,
			})
		)
		.then(() => ({
			route_id: String(route_id || '').trim(),
			route_long_name: String((route_long_name || route_id) || '').trim(),
			trip_id: String(trip_id || '').trim(),
			service_id: String(service_id || '').trim(),
			date: normalizeDateInput(date),
		}));
}

// Public helper used by /admin/custom-trip (builds IDs per spec)
function createCustomDirectTrip({
	route_name,
	date,
	start_station,
	end_station,
	departure_time,
	arrival_time,
}) {
	const routeId = String(route_name || '').trim();
	if (!routeId) return Promise.reject(new Error('Brak route_name'));

	const dateIso = normalizeDateInput(date);
	const dateCompact = dateIso.replaceAll('-', '');

	const depSec = timeToSec(departure_time);
	const arrSec = timeToSec(arrival_time);
	if (!Number.isFinite(depSec) || !Number.isFinite(arrSec)) {
		return Promise.reject(new Error('Invalid time format'));
	}
	if (arrSec <= depSec) {
		return Promise.reject(new Error('arrival_time musi być później niż departure_time'));
	}

	const serviceId = `${routeId}_${dateCompact}`;
	const tripId = serviceId;

	return createCustomDirectTripInsert({
		route_id: routeId,
		route_long_name: routeId,
		trip_id: tripId,
		service_id: serviceId,
		date: dateIso,
		start_station,
		end_station,
		departure_time,
		arrival_time,
	});
}

module.exports = {
	con,
	createUser,
	getUserByUsername,
	getAllUsers,
	deleteUser,
	updateUserPassword,
	getTopStops,
	getAgencyActivity,
	getRouteTripCounts,
	getAllStopNames,
	getNextDeparturesFromStation,
	getNextArrivalsToStation,
	getDirectConnections,
	insertCustomAgency,
	upsertCustomRoute,
	insertTrip,
	upsertCalendarDate,
	getStopIdByName,
	insertTwoStopTimes,
	createCustomDirectTripInsert,
	createCustomDirectTrip,
};
