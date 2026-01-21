/**
 * GTFS import helpers.
 *
 * Pipeline:
 * 1) download GTFS zip (stream)
 * 2) extract to `server/sql/gtfs/`
 * 3) import selected columns via `LOAD DATA LOCAL INFILE`
 *
 * Implementation detail:
 * - header columns are read dynamically so extra GTFS columns can be ignored
 */
const axios = require('axios');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const { con } = require('./sql');

const GTFS_DIR = path.join(__dirname, 'gtfs');
const ZIP_PATH = path.join(GTFS_DIR, 'gtfs.zip');

function toMysqlFilePath(p) {
  return p.replace(/\\/g, '/');
}

function readFirstLine(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    let done = false;

    function finishWith(line) {
      if (done) return;
      done = true;
      stream.destroy();
      resolve(line);
    }

    stream.on('data', chunk => {
      buffer += chunk;
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        finishWith(buffer.slice(0, idx));
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (!done) resolve(buffer);
    });
  });
}

async function readHeaderColumns(filePath) {
  const raw = await readFirstLine(filePath);
  const line = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r$/, '')
    .trim();
  if (!line) {
    throw new Error(`Empty header in ${path.basename(filePath)}`);
  }
  return line.split(',').map(s => String(s || '').trim()).filter(Boolean);
}

function buildLoadColumnsFromHeader(headerCols, keepCols, overrides = {}) {
  const keep = new Set((keepCols || []).map(String));
  return headerCols
    .map(col => {
      const c = String(col || '').trim();
      if (!c) return null;
      if (overrides[c]) return overrides[c];
      if (keep.has(c)) return c;
      return c.startsWith('@') ? c : `@${c}`;
    })
    .filter(Boolean)
    .join(',');
}

function download(url) {
  return new Promise((resolve, reject) => {
    fs.mkdir(path.dirname(ZIP_PATH), { recursive: true }, err => {
      if (err) return reject(err);

      axios({
        url,
        method: 'GET',
        responseType: 'stream',
      })
        .then(response => {
          const writer = fs.createWriteStream(ZIP_PATH);
          response.data.pipe(writer);
          writer.on('finish', () => resolve(ZIP_PATH));
          writer.on('error', reject);
        })
        .catch(reject);
    });
  });
}

function extract() {
  return new Promise((resolve, reject) => {
	fs.mkdir(GTFS_DIR, { recursive: true }, err => {
		if (err) return reject(err);
		fs.createReadStream(ZIP_PATH)
			.pipe(unzipper.Extract({ path: GTFS_DIR }))
			.on('close', resolve)
			.on('error', reject);
	});
  });
}

function emptyFolder() {
  return new Promise((resolve, reject) => {
	fs.rm(GTFS_DIR, { recursive: true, force: true }, err => {
		if (err) return reject(err);
		fs.mkdir(GTFS_DIR, { recursive: true }, err => {
			if (err) return reject(err);
			resolve();
		});
	});
  });
}

// --- GTFS SQL IMPORT HELPERS ---

function truncateTables() {
  return new Promise((resolve, reject) => {
    const sql = [
      'SET FOREIGN_KEY_CHECKS = 0;',
      'TRUNCATE TABLE stop_times;',
      'TRUNCATE TABLE stops;',
      'TRUNCATE TABLE trips;',
      'TRUNCATE TABLE calendar_dates;',
      'TRUNCATE TABLE calendar;',
      'TRUNCATE TABLE routes;',
      'TRUNCATE TABLE agency;',
      'SET FOREIGN_KEY_CHECKS = 1;'
    ].join('\n');
    con.query(sql, err => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function loadAgency() {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(GTFS_DIR, 'agency.txt');
    const infile = toMysqlFilePath(filePath);
    readHeaderColumns(filePath)
      .then(headerCols => {
        const cols = buildLoadColumnsFromHeader(headerCols, [
          'agency_id',
          'agency_name',
          'agency_url',
          'agency_timezone',
        ]);
        const sql = `LOAD DATA LOCAL INFILE '${infile}'
INTO TABLE agency
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(${cols})`;
        con.query(sql, err => {
          if (err) return reject(err);
          resolve();
        });
      })
      .catch(reject);
  });
}

function loadRoutes() {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(GTFS_DIR, 'routes.txt');
    const infile = toMysqlFilePath(filePath);
    readHeaderColumns(filePath)
      .then(headerCols => {
        const cols = buildLoadColumnsFromHeader(headerCols, [
          'route_id',
          'agency_id',
          'route_short_name',
          'route_long_name',
          'route_type',
        ]);
        const sql = `LOAD DATA LOCAL INFILE '${infile}'
INTO TABLE routes
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(${cols})`;
        con.query(sql, err => {
          if (err) return reject(err);
          resolve();
        });
      })
      .catch(reject);
  });
}

function loadCalendarDates() {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(GTFS_DIR, 'calendar_dates.txt');
    const infile = toMysqlFilePath(filePath);
    readHeaderColumns(filePath)
      .then(headerCols => {
        const cols = buildLoadColumnsFromHeader(
          headerCols,
          ['service_id', 'exception_type'],
          { date: '@date' }
        );
        const sql = `LOAD DATA LOCAL INFILE '${infile}'
INTO TABLE calendar_dates
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(${cols})
SET date = STR_TO_DATE(@date, '%Y%m%d')`;
        con.query(sql, err => {
          if (err) return reject(err);
          resolve();
        });
      })
      .catch(reject);
  });
}

function loadCalendar() {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(GTFS_DIR, 'calendar.txt');
    const infile = toMysqlFilePath(filePath);
    readHeaderColumns(filePath)
      .then(headerCols => {
        const cols = buildLoadColumnsFromHeader(
          headerCols,
          [
            'service_id',
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
          ],
          { start_date: '@start_date', end_date: '@end_date' }
        );
        const sql = `LOAD DATA LOCAL INFILE '${infile}'
INTO TABLE calendar
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(${cols})
SET start_date = STR_TO_DATE(@start_date, '%Y%m%d'),
    end_date = STR_TO_DATE(@end_date, '%Y%m%d')`;
        con.query(sql, err => {
          if (err) return reject(err);
          resolve();
        });
      })
		.catch(err => {
			//calendar.txt optional
			if (err && err.code === 'ENOENT') return resolve();
			reject(err);
		});
  });
}

function loadTrips() {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(GTFS_DIR, 'trips.txt');
    const infile = toMysqlFilePath(filePath);
    readHeaderColumns(filePath)
      .then(headerCols => {
        const cols = buildLoadColumnsFromHeader(headerCols, [
          'route_id',
          'service_id',
          'trip_id',
        ]);
        const sql = `LOAD DATA LOCAL INFILE '${infile}'
INTO TABLE trips
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(${cols})`;
        con.query(sql, err => {
          if (err) return reject(err);
          resolve();
        });
      })
      .catch(reject);
  });
}

function loadStops() {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(GTFS_DIR, 'stops.txt');
    const infile = toMysqlFilePath(filePath);
    readHeaderColumns(filePath)
      .then(headerCols => {
        const cols = buildLoadColumnsFromHeader(headerCols, [
          'stop_id',
          'stop_name',
          'stop_lat',
          'stop_lon',
        ]);
        const sql = `LOAD DATA LOCAL INFILE '${infile}'
INTO TABLE stops
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(${cols})`;
        con.query(sql, err => {
          if (err) return reject(err);
          resolve();
        });
      })
      .catch(reject);
  });
}

function loadStopTimes() {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(GTFS_DIR, 'stop_times.txt');
    const infile = toMysqlFilePath(filePath);
    readHeaderColumns(filePath)
      .then(headerCols => {
        const cols = buildLoadColumnsFromHeader(headerCols, [
          'trip_id',
          'arrival_time',
          'departure_time',
          'stop_id',
          'stop_sequence',
        ]);
        const sql = `LOAD DATA LOCAL INFILE '${infile}'
INTO TABLE stop_times
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(${cols})`;
        con.query(sql, err => {
          if (err) return reject(err);
          resolve();
        });
      })
      .catch(reject);
  });
}


module.exports = {
  download,
  extract,
  emptyFolder,
  truncateTables,
  loadAgency,
  loadRoutes,
  loadCalendar,
  loadCalendarDates,
  loadTrips,
  loadStops,
  loadStopTimes,
};
