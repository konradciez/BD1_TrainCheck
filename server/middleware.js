const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_SECRET = 'supersecretaccesstoken';
const TOKEN_EXPIRES_IN = '20m';

function generateToken(user) {
	return jwt.sign(
		{
			id: user && (user.id || user.username),
			username: user.username,
			role: user.role,
		},
		ACCESS_TOKEN_SECRET,
		{ expiresIn: TOKEN_EXPIRES_IN }
	);
}

function authenticateJWT(req, res, next) {
	const authHeader = req.headers.authorization;

	if (!authHeader)
        return res.status(401).json({ message: 'Brak tokena' });
	
    const token = authHeader.split(' ')[1];
	jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
		if (err) 
            return res.status(403).json({ message: 'Błędny token' });
        
		req.user = user;
		next();
	});
}

function authorizeAdmin(req, res, next) {
       if (!req.user || req.user.role !== 'ADMIN') {
	       return res.status(403).json({ message: 'Brak uprawnień (ADMIN)' });
       }
       next();
}

module.exports = {
	generateToken,
	authenticateJWT,
	authorizeAdmin,
};
