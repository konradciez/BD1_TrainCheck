/**
 * TrainCheck frontend controller.
 *
 * UI model:
 * - plain JS renders tab views into containers from index.html
 * - navigation uses `setActiveTab()` + view-specific renderers
 * - data is fetched from backend REST endpoints defined in `server/routes.js`
 */
const API_URL = 'http://localhost:5200';

const TABS = [
	{
		id: 'connection',
		label: 'Połączenia',
		containers: ['view-connection', 'view-connection-result'],
	},
	{
		id: 'timetable',
		label: 'Rozkład',
		containers: ['view-timetable', 'view-timetable-result'],
	},
	{
		id: 'stats',
		label: 'Statystyki',
		containers: ['view-stats', 'view-stats0', 'view-stats1', 'view-stats2'],
	},
	{
		id: 'profile',
		label: 'Profil',
		containers: ['view-profile', 'view-profile-result'],
	},
	{
		id: 'add-route',
		label: 'Dodaj kurs',
		requiresRole: 'ADMIN',
		containers: ['view-add-route', 'view-add-route-result'],
	},
	{
		id: 'admin',
		label: 'Admin',
		requiresRole: 'ADMIN',
		containers: ['view-admin', 'view-admin-result'],
	},
];

let activeTabId = null;
let navbarListenerAttached = false;

document.addEventListener('DOMContentLoaded', () => {
	// If token expired, drop it.
	if (!isLoggedIn() && getJWT()) removeJWT();
	renderAuthUI();
});

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function setAuthMessage(message, type = 'info') {
	const authResult = document.getElementById('auth-result');
	if (!authResult) return;
	if (!message) {
		authResult.innerHTML = '';
		return;
	}
	authResult.innerHTML = `<div class="notice ${type}">${escapeHtml(message)}</div>`;
}

function setHidden(id, hidden) {
	const el = document.getElementById(id);
	if (!el) return;
	if (hidden) el.classList.add('hidden');
	else el.classList.remove('hidden');
}

function clearAllViewContent() {
	const viewIds = [
		'view-connection',
		'view-connection-result',
		'view-timetable',
		'view-timetable-result',
		'view-stats',
		'view-stats0',
		'view-stats1',
		'view-stats2',
		'view-profile',
		'view-profile-result',
		'view-add-route',
		'view-add-route-result',
		'view-admin',
		'view-admin-result',
	];
	viewIds.forEach(id => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = '';
	});
}

function clearAndHideAllViews() {
	TABS.forEach(tab => {
		(tab.containers || []).forEach(containerId => {
			setHidden(containerId, true);
			const el = document.getElementById(containerId);
			if (el) el.innerHTML = '';
		});
	});
}

function renderAuthUI() {
	const hello = document.getElementById('hello');
	const authActions = document.getElementById('auth-actions');
	const navbar = document.getElementById('navbar');

	const loggedIn = isLoggedIn();
	const user = getCurrentUser();

	if (hello) {
		hello.innerHTML = user
			? `Zalogowany: ${escapeHtml(user.username)} (${escapeHtml(user.role)})`
			: '';
	}

	setAuthMessage('');

	if (!authActions) return;

	if (!loggedIn) {
		if (navbar) navbar.innerHTML = '';
		activeTabId = null;
		clearAndHideAllViews();

		authActions.innerHTML = `
			<div class="loginCard">
				<div class="loginTitle">Zaloguj się</div>
				<div class="field">
					<label for="username">Username</label>
					<input type="text" id="username" autocomplete="username" />
				</div>
				<div class="field">
					<label for="password">Password</label>
					<input type="password" id="password" autocomplete="current-password" />
				</div>
				<div class="btnRow">
					<button class="primary" id="btn-login" type="button">Log in</button>
					<button class="secondary" id="btn-register" type="button">Register</button>
				</div>
			</div>
		`;

		document.getElementById('btn-login')?.addEventListener('click', _login);
		document.getElementById('btn-register')?.addEventListener('click', _register);

		const usernameEl = document.getElementById('username');
		const passwordEl = document.getElementById('password');
		[usernameEl, passwordEl].forEach(el => {
			if (!el) return;
			el.addEventListener('keydown', ev => {
				if (ev.key === 'Enter') _login();
			});
		});
		return;
	}

	authActions.innerHTML = `
		<div class="authBar">
			<button class="secondary" id="btn-logout" type="button">Wyloguj</button>
		</div>
	`;
	if (document.getElementById('btn-logout')) {
		document.getElementById('btn-logout').addEventListener('click', _log_out);
	}

	renderNavbar();
	if (!activeTabId) setActiveTab('connection');
}

function _login() {
	const username = (document.getElementById('username')?.value || '').trim();
	const password = document.getElementById('password')?.value || '';

	setAuthMessage('');
	if (!username || !password) {
		setAuthMessage('Podaj username i hasło.', 'error');
		return;
	}

	fetch(API_URL + '/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password }),
	})
		.then(res =>
			res.text().then(text => {
				let data = {};
				try {
					data = JSON.parse(text);
				} catch (e) {
					data = { message: text };
				}
				if (!res.ok) throw new Error(data.message || 'Nie udało się zalogować');
				return data;
			})
		)
		.then(data => {
			if (data.token) {
				setJWT(data.token);
				renderAuthUI();
			} else {
				setAuthMessage('Nie udało się zalogować', 'error');
			}
		})
		.catch(err => {
			setAuthMessage('Błąd: ' + err.message, 'error');
		});
}

function _register() {
	const username = (document.getElementById('username')?.value || '').trim();
	const password = document.getElementById('password')?.value || '';

	setAuthMessage('');
	if (!username || !password) {
		setAuthMessage('Podaj username i hasło.', 'error');
		return;
	}

	fetch(API_URL + '/auth/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password }),
	})
		.then(res =>
			res.text().then(text => {
				let data = {};
				try {
					data = JSON.parse(text);
				} catch (e) {
					data = { message: text };
				}
				if (!res.ok) throw new Error(data.message || 'Nie udało się zarejestrować');
				return data;
			})
		)
		.then(data => {
			if (data.token) {
				setJWT(data.token);
				renderAuthUI();
			} else {
				setAuthMessage('Nie udało się zarejestrować', 'error');
			}
		})
		.catch(err => {
			setAuthMessage('Błąd: ' + err.message, 'error');
		});
}

function _log_out() {
	removeJWT();
	activeTabId = null;
	setAuthMessage('Wylogowano.', 'success');
	renderAuthUI();
}

function renderNavbar() {
	const navbar = document.getElementById('navbar');
	if (!navbar) return;

	const user = getCurrentUser();
	const role = user?.role || null;
	const tabsForUser = TABS.filter(t => !t.requiresRole || t.requiresRole === role);

	navbar.innerHTML = `
		<div class="tabs" role="tablist" aria-label="Nawigacja">
			${tabsForUser
				.map(
					tab =>
						`<button class="tab" type="button" role="tab" data-tab="${tab.id}" aria-selected="false">${escapeHtml(tab.label)}</button>`
				)
				.join('')}
		</div>
	`;

	if (!navbarListenerAttached) {
		navbar.addEventListener('click', ev => {
			const btn = ev.target?.closest?.('button[data-tab]');
			if (!btn) return;
			setActiveTab(btn.getAttribute('data-tab'));
		});
		navbarListenerAttached = true;
	}
}

function setActiveTab(tabId) {
	const user = getCurrentUser();
	if (!user) return;

	const role = user.role;
	const tab = TABS.find(t => t.id === tabId);
	if (!tab) return;
	if (tab.requiresRole && tab.requiresRole !== role) return;

	activeTabId = tabId;

	const navbar = document.getElementById('navbar');
	if (navbar) {
		navbar.querySelectorAll('button[data-tab]').forEach(el => {
			const isActive = el.getAttribute('data-tab') === tabId;
			el.classList.toggle('active', isActive);
			el.setAttribute('aria-selected', String(isActive));
		});
	}

	TABS.forEach(t => {
		(t.containers || []).forEach(containerId => {
			const shouldShow = t.id === tabId;
			setHidden(containerId, !shouldShow);
		});
	});

	renderTabView(tabId);
}

function renderTabView(tabId) {
	clearAllViewContent();
	setAuthMessage('');

	switch (tabId) {
		case 'connection':
			renderConnectionView();
			break;
		case 'timetable':
			renderTimetableView();
			break;
		case 'stats':
			renderStatsView();
			break;
		case 'profile':
			renderProfileView();
			break;
		case 'add-route':
			renderAddRouteView();
			break;
		case 'admin':
			renderAdminView();
			break;
		default:
			break;
	}
}

function renderConnectionView() {
	_connection();
}

function renderTimetableView() {
	_timetable();
}

function _connection_set_status(message) {
	const el = document.getElementById('view-connection-status');
	if (!el) return;
	el.textContent = String(message || '');
}

function _connection() {
	const root = document.getElementById('view-connection');
	const result = document.getElementById('view-connection-result');
	if (!root) return;

	const now = new Date();
	const yyyy = String(now.getFullYear());
	const mm = String(now.getMonth() + 1).padStart(2, '0');
	const dd = String(now.getDate()).padStart(2, '0');
	const hh = String(now.getHours()).padStart(2, '0');
	const min = String(now.getMinutes()).padStart(2, '0');
	const dateDefault = `${yyyy}-${mm}-${dd}`;
	const timeDefault = `${hh}:${min}`;

	root.innerHTML = `
		<div class="viewHeader">
			<div class="viewTitle">Połączenia bezpośrednie</div>
		</div>
		<div id="view-connection-status" class="muted"></div>
		<div class="field">
			<label for="connection-start">Stacja początkowa</label>
			<input id="connection-start" type="text" list="all-stops-connection" />
		</div>
		<div class="field">
			<label for="connection-end">Stacja końcowa</label>
			<input id="connection-end" type="text" list="all-stops-connection" />
		</div>
		<datalist id="all-stops-connection"></datalist>
		<div class="field">
			<label for="connection-date">Data</label>
			<input id="connection-date" type="date" value="${escapeHtml(dateDefault)}" />
		</div>
		<div class="field">
			<label for="connection-time">Godzina</label>
			<input id="connection-time" type="time" value="${escapeHtml(timeDefault)}" />
		</div>
		<div class="btnRow">
			<button type="button" onclick="_connection_search()">Szukaj</button>
		</div>
	`;

	if (result) result.innerHTML = '';

	_connection_set_status('Wczytywanie stacji...');
	_getStopsAll()
		.then(names => {
			const dl = document.getElementById('all-stops-connection');
			if (!dl) return;
			dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
			_connection_set_status(`Wczytano stacji: ${names.length}`);
		})
		.catch(err => {
			_connection_set_status('Błąd ładowania stacji: ' + err.message);
		});
}

function renderConnectionsTable(rows) {
	const arr = Array.isArray(rows) ? rows : [];
	if (arr.length === 0) {
		return '<div class="muted">Brak połączeń</div>';
	}

	const first = arr[0];
	const cols = first && typeof first === 'object' && !Array.isArray(first)
		? Object.keys(first)
		: ['value'];

	const thead = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
	const tbody = arr
		.map(r => {
			if (r && typeof r === 'object' && !Array.isArray(r)) {
				return `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`;
			}
			return `<tr><td>${escapeHtml(r)}</td></tr>`;
		})
		.join('');

	return `
		<table class="table">
			<thead><tr>${thead}</tr></thead>
			<tbody>${tbody}</tbody>
		</table>
	`;
}

function _connection_search() {
	const startStation = (document.getElementById('connection-start')?.value || '').trim();
	const endStation = (document.getElementById('connection-end')?.value || '').trim();
	const dateRaw = (document.getElementById('connection-date')?.value || '').trim();
	const time = (document.getElementById('connection-time')?.value || '').trim();

	const date = dateRaw.replaceAll('-', ''); // YYYY-MM-DD -> YYYYMMDD

	const result = document.getElementById('view-connection-result');
	if (result) result.innerHTML = '';
	_connection_set_status('Wyszukiwanie...');

	fetch(API_URL + '/connection', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ startStation, endStation, date, time }),
	})
		.then(res =>
			res.text().then(text => {
				let data = text;
				try {
					data = JSON.parse(text);
				} catch (e) {
				}
				return { ok: res.ok, status: res.status, data };
			})
		)
		.then(({ ok, status, data }) => {
			if (!ok) {
				const msg = (data && data.message) || (typeof data === 'string' ? data : '') || `HTTP ${status}`;
				throw new Error(msg);
			}

			const rows = Array.isArray(data)
				? data
				: Array.isArray(data?.connections)
					? data.connections
					: [];

			if (result) {
				result.innerHTML = `
					<div class="viewHeader"><div class="viewTitle">Wyniki</div></div>
					${renderConnectionsTable(rows)}
				`;
			}

			if (data && typeof data === 'object' && data.message) {
				_connection_set_status(String(data.message));
			} else {
				_connection_set_status(`Znaleziono: ${rows.length}`);
			}
		})
		.catch(err => {
			_connection_set_status('Błąd: ' + err.message);
			if (result) result.innerHTML = '<div class="notice error">Błąd wyszukiwania</div>';
		});
}

function renderStatsView() {
	_stats();
}

function renderProfileView() {
	_profile();
}

function renderAddRouteView() {
	_add_route();
}

function renderAdminView() {
	_admin();
}

function _timetable_set_status(message) {
	const el = document.getElementById('view-timetable-status');
	if (!el) return;
	el.textContent = String(message || '');
}

function renderTimetableTable(rows) {
	const arr = Array.isArray(rows) ? rows : [];
	if (arr.length === 0) {
		return '<div class="muted">Brak danych</div>';
	}

	const first = arr[0];
	const cols = first && typeof first === 'object' && !Array.isArray(first)
		? Object.keys(first)
		: ['value'];

	const thead = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
	const tbody = arr
		.map(r => {
			if (r && typeof r === 'object' && !Array.isArray(r)) {
				return `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`;
			}
			return `<tr><td>${escapeHtml(r)}</td></tr>`;
		})
		.join('');

	return `
		<table class="table">
			<thead><tr>${thead}</tr></thead>
			<tbody>${tbody}</tbody>
		</table>
	`;
}

function _timetable() {
	const root = document.getElementById('view-timetable');
	const result = document.getElementById('view-timetable-result');
	if (!root) return;

	const now = new Date();
	const yyyy = String(now.getFullYear());
	const mm = String(now.getMonth() + 1).padStart(2, '0');
	const dd = String(now.getDate()).padStart(2, '0');
	const hh = String(now.getHours()).padStart(2, '0');
	const min = String(now.getMinutes()).padStart(2, '0');
	const dateDefault = `${yyyy}-${mm}-${dd}`;
	const timeDefault = `${hh}:${min}`;

	root.innerHTML = `
		<div class="viewHeader">
			<div class="viewTitle">Rozkład stacyjny</div>
			<div class="muted">POST /timetable/departures, POST /timetable/arrivals, GET /stops/all</div>
		</div>
		<div id="view-timetable-status" class="muted"></div>
		<div class="field">
			<label for="timetable-station">Stacja</label>
			<input id="timetable-station" type="text" list="all-stops-timetable" />
		</div>
		<datalist id="all-stops-timetable"></datalist>
		<div class="field">
			<label for="timetable-date">Data</label>
			<input id="timetable-date" type="date" value="${escapeHtml(dateDefault)}" />
		</div>
		<div class="field">
			<label for="timetable-time">Godzina</label>
			<input id="timetable-time" type="time" value="${escapeHtml(timeDefault)}" />
		</div>
		<div class="btnRow">
			<button type="button" onclick="_timetable_departures()">Odjazdy</button>
			<button type="button" onclick="_timetable_arrivals()">Przyjazdy</button>
		</div>
	`;

	if (result) result.innerHTML = '';

	_timetable_set_status('Wczytywanie stacji...');
	_getStopsAll()
		.then(names => {
			const dl = document.getElementById('all-stops-timetable');
			if (!dl) return;
			dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
			_timetable_set_status(`Wczytano stacji: ${names.length}`);
		})
		.catch(err => {
			_timetable_set_status('Błąd ładowania stacji: ' + err.message);
		});
}

function _timetable_post(path, body) {
	return fetch(API_URL + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body || {}),
	}).then(res =>
		res.text().then(text => {
			let data = text;
			try {
				data = JSON.parse(text);
			} catch (e) {
			}
			return { ok: res.ok, status: res.status, data };
		})
	);
}

function _timetable_departures() {
	const stationName = (document.getElementById('timetable-station')?.value || '').trim();
	const date = (document.getElementById('timetable-date')?.value || '').trim();
	const time = (document.getElementById('timetable-time')?.value || '').trim();
	const result = document.getElementById('view-timetable-result');
	if (result) result.innerHTML = '';

	_timetable_set_status('Ładowanie odjazdów...');
	_timetable_post('/timetable/departures', { stationName, date, time })
		.then(({ ok, status, data }) => {
			if (!ok) {
				const msg = (data && data.message) || (typeof data === 'string' ? data : '') || `HTTP ${status}`;
				throw new Error(msg);
			}
			if (result) {
				result.innerHTML = `
					<div class="viewHeader"><div class="viewTitle">Odjazdy</div></div>
					${renderTimetableTable(data)}
				`;
			}
			_timetable_set_status(`Odjazdy: ${(Array.isArray(data) ? data.length : 0)}`);
		})
		.catch(err => {
			_timetable_set_status('Błąd: ' + err.message);
			if (result) result.innerHTML = '<div class="notice error">Błąd pobierania odjazdów</div>';
		});
}

function _timetable_arrivals() {
	const stationName = (document.getElementById('timetable-station')?.value || '').trim();
	const date = (document.getElementById('timetable-date')?.value || '').trim();
	const time = (document.getElementById('timetable-time')?.value || '').trim();
	const result = document.getElementById('view-timetable-result');
	if (result) result.innerHTML = '';

	_timetable_set_status('Ładowanie przyjazdów...');
	_timetable_post('/timetable/arrivals', { stationName, date, time })
		.then(({ ok, status, data }) => {
			if (!ok) {
				const msg = (data && data.message) || (typeof data === 'string' ? data : '') || `HTTP ${status}`;
				throw new Error(msg);
			}
			if (result) {
				result.innerHTML = `
					<div class="viewHeader"><div class="viewTitle">Przyjazdy</div></div>
					${renderTimetableTable(data)}
				`;
			}
			_timetable_set_status(`Przyjazdy: ${(Array.isArray(data) ? data.length : 0)}`);
		})
		.catch(err => {
			_timetable_set_status('Błąd: ' + err.message);
			if (result) result.innerHTML = '<div class="notice error">Błąd pobierania przyjazdów</div>';
		});
}

function _stats_set_status(message) {
	const el = document.getElementById('view-stats-status');
	if (!el) return;
	el.textContent = String(message || '');
}

function _stats_fetch_json(path) {
	const token = getJWT();
	return fetch(API_URL + path, {
		method: 'GET',
		headers: {
			Authorization: 'Bearer ' + token,
		},
	}).then(res =>
		res.text().then(text => {
			let data = text;
			try {
				data = JSON.parse(text);
			} catch (e) {
			}
			return { ok: res.ok, status: res.status, data };
		})
	);
}

function _renderTable(containerId, title, rows) {
	const root = document.getElementById(containerId);
	if (!root) return;

	const arr = Array.isArray(rows) ? rows : [];
	if (arr.length === 0) {
		root.innerHTML = `<div class="viewHeader"><div class="viewTitle">${escapeHtml(title)}</div></div><div class="muted">Brak danych</div>`;
		return;
	}

	const first = arr[0];
	const cols = first && typeof first === 'object' && !Array.isArray(first)
		? Object.keys(first)
		: ['value'];

	const thead = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
	const tbody = arr
		.map(r => {
			if (r && typeof r === 'object' && !Array.isArray(r)) {
				return `<tr>${cols
					.map(c => `<td>${escapeHtml(r[c])}</td>`)
					.join('')}</tr>`;
			}
			return `<tr><td>${escapeHtml(r)}</td></tr>`;
		})
		.join('');

	root.innerHTML = `
		<div class="viewHeader"><div class="viewTitle">${escapeHtml(title)}</div></div>
		<table class="table">
			<thead><tr>${thead}</tr></thead>
			<tbody>${tbody}</tbody>
		</table>
	`;
}

function _stats() {
	const root = document.getElementById('view-stats');
	const out0 = document.getElementById('view-stats0');
	const out1 = document.getElementById('view-stats1');
	const out2 = document.getElementById('view-stats2');

	if (root) {
		root.innerHTML = `
			<div class="viewHeader">
				<div class="viewTitle">Statystyki</div>
			</div>
			<div id="view-stats-status" class="muted"></div>
		`;
	}
	if (out0) out0.innerHTML = '';
	if (out1) out1.innerHTML = '';
	if (out2) out2.innerHTML = '';

	if (!isLoggedIn() || !getJWT()) {
		_stats_set_status('Musisz być zalogowany.');
		return;
	}

	_stats_set_status('Ładowanie: /stats/top-stops ...');
	_stats_fetch_json('/stats/top-stops')
		.then(({ ok, status, data }) => {
			if (!ok) {
				throw new Error((data && data.message) || `HTTP ${status}`);
			}
			_renderTable('view-stats0', 'Top stops', data);
			_stats_set_status('Ładowanie: /stats/agency-activity ...');
			return _stats_fetch_json('/stats/agency-activity');
		})
		.then(({ ok, status, data }) => {
			if (!ok) {
				throw new Error((data && data.message) || `HTTP ${status}`);
			}
			_renderTable('view-stats1', 'Agency activity', data);
			_stats_set_status('Ładowanie: /stats/route-trip-counts ...');
			return _stats_fetch_json('/stats/route-trip-counts');
		})
		.then(({ ok, status, data }) => {
			if (!ok) {
				throw new Error((data && data.message) || `HTTP ${status}`);
			}
			_renderTable('view-stats2', 'Route trip counts', data);
			_stats_set_status('');
		})
		.catch(err => {
			_stats_set_status('Błąd: ' + err.message);
		});
}

function _profile_set_result(title, payload) {
	const result = document.getElementById('view-profile-result');
	if (!result) return;
	const body = payload === undefined ? '' : escapeHtml(String(payload));
	result.innerHTML = `<div><b>${escapeHtml(title)}</b></div><pre class="code">${body}</pre>`;
}

function _profile() {
	const user = getCurrentUser();
	const root = document.getElementById('view-profile');
	const result = document.getElementById('view-profile-result');
	if (!root) return;

	if (!isLoggedIn() || !user) {
		root.innerHTML = '<div class="notice error">Musisz być zalogowany.</div>';
		if (result) result.innerHTML = '';
		return;
	}

	root.innerHTML = `
		<div class="viewHeader">
			<div class="viewTitle">Profil</div>
		</div>
		<div class="field">
			<label for="newPassword">Nowe hasło</label>
			<input id="newPassword" type="password" autocomplete="new-password" />
		</div>
		<div class="btnRow">
			<button type="button" onclick="_profile_change_password()">Zmień hasło</button>
		</div>
	`;

	if (result) result.innerHTML = '';
}

function _profile_change_password() {
	_profile_set_result('PUT /profile/password', '...');

	const token = getJWT();
	const newPassword = document.getElementById('newPassword')?.value || '';

	fetch(API_URL + '/profile/password', {
		method: 'PUT',
		headers: {
			Authorization: 'Bearer ' + token,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ newPassword }),
	})
		.then(res =>
			res.text().then(text => {
				let data = text;
				try {
					data = JSON.parse(text);
				} catch (e) {
				}
				return { ok: res.ok, status: res.status, data };
			})
		)
		.then(({ ok, status, data }) => {
			_profile_set_result(
				(ok ? 'OK' : 'Błąd'),
				data.message
			);
		})
		.catch(err => _profile_set_result('Błąd (fetch)', err.message));
}

let _stopsAllCache = null;
let _stopsAllLoading = null;

function _add_route_set_status(message) {
	const el = document.getElementById('view-add-route-status');
	if (!el) return;
	el.textContent = String(message || '');
}

function _add_route_set_result(title, payload) {
	const result = document.getElementById('view-add-route-result');
	if (!result) return;
	const body = payload === undefined ? '' : escapeHtml(String(payload));
	result.innerHTML = `<div><b>${escapeHtml(title)}</b></div><pre class="code">${body}</pre>`;
}

function _normalizeStopName(item) {
	if (typeof item === 'string') return item;
	if (!item || typeof item !== 'object') return '';
	return String(item.stop_name || item.name || item.stop || '').trim();
}

function _getStopsAll() {
	if (_stopsAllCache) return Promise.resolve(_stopsAllCache);
	if (_stopsAllLoading) return _stopsAllLoading;

	_add_route_set_status('Wczytywanie stacji...');
	_stopsAllLoading = fetch(API_URL + '/stops/all', {
		method: 'GET',
	}).then(res =>
		res.text().then(text => {
			let data = [];
			try {
				data = JSON.parse(text);
			} catch (e) {
				data = [];
			}
			if (!res.ok) {
				const msg = (data && data.message) || text || `HTTP ${res.status}`;
				throw new Error(msg);
			}
			const names = (Array.isArray(data) ? data : [])
				.map(_normalizeStopName)
				.map(s => String(s || '').trim())
				.filter(Boolean);
			_stopsAllCache = names;
			return names;
		})
	);

	return _stopsAllLoading
		.then(names => {
			_stopsAllLoading = null;
			_add_route_set_status(`Wczytano stacji: ${names.length}`);
			return names;
		})
		.catch(err => {
			_stopsAllLoading = null;
			_add_route_set_status('Błąd ładowania stacji: ' + err.message);
			throw err;
		});
}

function _add_route() {
	const user = getCurrentUser();
	if (!user || user.role !== 'ADMIN') {
		const root = document.getElementById('view-add-route');
		if (root) root.innerHTML = '<div class="notice error">Brak uprawnień (ADMIN).</div>';
		return;
	}

	const root = document.getElementById('view-add-route');
	const result = document.getElementById('view-add-route-result');
	if (!root) return;

	const now = new Date();
	const yyyy = String(now.getFullYear());
	const mm = String(now.getMonth() + 1).padStart(2, '0');
	const dd = String(now.getDate()).padStart(2, '0');
	const hh = String(now.getHours()).padStart(2, '0');
	const min = String(now.getMinutes()).padStart(2, '0');
	const dateDefault = `${yyyy}-${mm}-${dd}`;
	const depDefault = `${hh}:${min}`;
	const arrival = new Date(now.getTime() + 30 * 60000);
	const arrDefault = `${String(arrival.getHours()).padStart(2, '0')}:${String(arrival.getMinutes()).padStart(2, '0')}`;

	root.innerHTML = `
		<div class="viewHeader">
			<div class="viewTitle">Dodaj kurs</div>
		</div>
		<div id="view-add-route-status" class="muted"></div>
		<div class="field">
			<label for="route_name">Nazwa trasy</label>
			<input id="route_name" type="text"/>
		</div>
		<div class="field">
			<label for="date">Data</label>
			<input id="date" type="date" value="${escapeHtml(dateDefault)}" />
		</div>
		<div class="field">
			<label for="start_station">Stacja początkowa</label>
			<input id="start_station" type="text" list="all-stops" />
		</div>
		<div class="field">
			<label for="end_station">Stacja końcowa</label>
			<input id="end_station" type="text" list="all-stops" />
		</div>
		<datalist id="all-stops"></datalist>
		<div class="field">
			<label for="departure_time">Godzina odjazdu</label>
			<input id="departure_time" type="time" value="${escapeHtml(depDefault)}" />
		</div>
		<div class="field">
			<label for="arrival_time">Godzina przyjazdu</label>
			<input id="arrival_time" type="time" value="${escapeHtml(arrDefault)}" />
		</div>
		<div class="btnRow">
			<button type="button" onclick="_admin_custom_trip_submit()">Dodaj</button>
		</div>
	`;

	if (result) result.innerHTML = '';

	_getStopsAll()
		.then(names => {
			const dl = document.getElementById('all-stops');
			if (!dl) return;
			dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
		})
		.catch(() => {
			// status already updated
		});
}

function _admin_custom_trip_submit() {
	_add_route_set_result('POST /admin/custom-trip', '...');

	const token = getJWT();
	const route_name = (document.getElementById('route_name')?.value || '').trim();
	const date = (document.getElementById('date')?.value || '').trim();
	const start_station = (document.getElementById('start_station')?.value || '').trim();
	const end_station = (document.getElementById('end_station')?.value || '').trim();
	const departure_time = (document.getElementById('departure_time')?.value || '').trim();
	const arrival_time = (document.getElementById('arrival_time')?.value || '').trim();

	fetch(API_URL + '/admin/custom-trip', {
		method: 'POST',
		headers: {
			Authorization: 'Bearer ' + token,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			route_name,
			date,
			start_station,
			end_station,
			departure_time,
			arrival_time,
		}),
	})
		.then(res =>
			res.text().then(text => {
				let data = text;
				try {
					data = JSON.parse(text);
				} catch (e) {
				}
				return { ok: res.ok, status: res.status, data };
			})
		)
		.then(({ ok, status, data }) => {
			_add_route_set_result(
				(ok ? 'OK' : 'Błąd') + ` (HTTP ${status})`,
				typeof data === 'string' ? data : JSON.stringify(data, null, 2)
			);
		})
		.catch(err => _add_route_set_result('Błąd (fetch)', err.message));
}

function _admin() {
	const root = document.getElementById('view-admin');
	const result = document.getElementById('view-admin-result');
	if (!root) return;

	root.innerHTML = `
		<div class="viewHeader">
			<div class="viewTitle">Admin GTFS</div>
		</div>
		<div class="btnRow">
			<button type="button" onclick="_admin_refresh_kml()">Pobierz GTFS KML</button>
			<button type="button" onclick="_admin_refresh_pr()">Pobierz GTFS PR</button>
			<button type="button" onclick="_admin_truncate()">Truncate GTFS</button>
			<button type="button" onclick="_admin_loadall()">Load all</button>
		</div>
	`;

	if (result) result.innerHTML = '';
}

function _admin_set_result(title, payload) {
	const result = document.getElementById('view-admin-result');
	if (!result) return;
	const body = payload === undefined ? '' : escapeHtml(String(payload));
	result.innerHTML = `<div><b>${escapeHtml(title)}</b></div><pre class="code">${body}</pre>`;
}

function _admin_post(path) {
	const token = getJWT();
	return fetch(API_URL + path, {
		method: 'POST',
		headers: {
			Authorization: 'Bearer ' + token,
		},
	}).then(res =>
		res.text().then(text => {
			let data = text;
			try {
				data = JSON.parse(text);
			} catch (e) {
			}
			return { ok: res.ok, status: res.status, data };
		})
	);
}

function _admin_refresh_kml() {
	_admin_set_result('POST /admin/gtfs/files/kml', '...');
	_admin_post('/admin/gtfs/files/kml')
		.then(({ ok, status, data }) => {
			_admin_set_result(
				(ok ? 'OK' : 'Błąd') + ` (HTTP ${status})`,
				typeof data === 'string' ? data : JSON.stringify(data, null, 2)
			);
		})
		.catch(err => _admin_set_result('Błąd (fetch)', err.message));
}

function _admin_refresh_pr() {
	_admin_set_result('POST /admin/gtfs/files/pr', '...');
	_admin_post('/admin/gtfs/files/pr')
		.then(({ ok, status, data }) => {
			_admin_set_result(
				(ok ? 'OK' : 'Błąd') + ` (HTTP ${status})`,
				typeof data === 'string' ? data : JSON.stringify(data, null, 2)
			);
		})
		.catch(err => _admin_set_result('Błąd (fetch)', err.message));
}

function _admin_truncate() {
	_admin_set_result('POST /admin/gtfs/truncate', '...');
	_admin_post('/admin/gtfs/truncate')
		.then(({ ok, status, data }) => {
			_admin_set_result(
				(ok ? 'OK' : 'Błąd') + ` (HTTP ${status})`,
				typeof data === 'string' ? data : JSON.stringify(data, null, 2)
			);
		})
		.catch(err => _admin_set_result('Błąd (fetch)', err.message));
}

function _admin_loadall() {
	_admin_set_result('POST /admin/gtfs/load/all', '...');
	_admin_post('/admin/gtfs/load/all')
		.then(({ ok, status, data }) => {
			_admin_set_result(
				(ok ? 'OK' : 'Błąd') + ` (HTTP ${status})`,
				typeof data === 'string' ? data : JSON.stringify(data, null, 2)
			);
		})
		.catch(err => _admin_set_result('Błąd (fetch)', err.message));
}

window._login = _login;
window._register = _register;
window._log_out = _log_out;

window._admin = _admin;
window._admin_refresh_kml = _admin_refresh_kml;
window._admin_refresh_pr = _admin_refresh_pr;
window._admin_truncate = _admin_truncate;
window._admin_loadall = _admin_loadall;

window._add_route = _add_route;
window._admin_custom_trip_submit = _admin_custom_trip_submit;

window._profile = _profile;
window._profile_change_password = _profile_change_password;

window._stats = _stats;

window._connection = _connection;
window._connection_search = _connection_search;
window.renderConnectionsTable = renderConnectionsTable;

window._timetable = _timetable;
window._timetable_departures = _timetable_departures;
window._timetable_arrivals = _timetable_arrivals;
window.renderTimetableTable = renderTimetableTable;

