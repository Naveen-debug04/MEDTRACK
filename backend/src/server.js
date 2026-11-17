require('dotenv').config();
const app = require('./app');
const { connectDatabase } = require('./config/db');

async function start() {
    await connectDatabase();
    const port = Number(process.env.PORT) || 4000;
    const host = process.env.HOST || '127.0.0.1';
    const server = app.listen(port, host, () => console.log(`MedTrack is running on http://localhost:${port}`));
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

start().catch((error) => {
    console.error('Unable to start MedTrack:', error.message);
    process.exitCode = 1;
});