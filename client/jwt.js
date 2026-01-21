const JWT_KEY = 'jwt_token';

function setJWT(token) {
	localStorage.setItem(JWT_KEY, token);
}

function getJWT() {
	return localStorage.getItem(JWT_KEY);
}

function removeJWT() {
	localStorage.removeItem(JWT_KEY);
}

function parseJWT(token) {
	if (!token) return null;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	try {
		const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
		return payload;
	} catch (e) {
		return null;
	}
}

function getCurrentUser() {
	const token = getJWT();
	if (!token) return null;
	const payload = parseJWT(token);
	if (!payload) return null;
	return {
		username: payload.username,
		role: payload.role,
		exp: payload.exp,
	};
}

function isLoggedIn() {
	const user = getCurrentUser();
	if (!user) return false;
	// Sprawdź czy token nie wygasł
	if (user.exp && Date.now() / 1000 > user.exp) return false;
	return true;
}

window.setJWT = setJWT;
window.getJWT = getJWT;
window.removeJWT = removeJWT;
window.getCurrentUser = getCurrentUser;
window.isLoggedIn = isLoggedIn;
