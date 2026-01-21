/**
 * TrainCheck backend entrypoint.
 *
 * Responsibilities:
 * - configure Express middleware (CORS, JSON parsing)
 * - mount API routes from `./routes`
 * - start HTTP server on configured port
 */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cors({
	origin: '*',
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
}));

app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
	if (req.method === 'OPTIONS') {
		return res.sendStatus(204);
	}
	next();
});

////////////////////////////////////////

const routes = require('./routes');
app.use('/', routes);

const PORT = 5200;

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
