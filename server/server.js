const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS — allow all origins in dev, specific origins in prod
const ALLOWED_ORIGINS = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000']
  : '*';
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '10mb' }));

// Serve static client build in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
}

app.get('/health', (_req, res) => res.json({ status: 'ok', platform: 'Pixel Perfect', version: '2.0.0' }));
app.get('/ping', (_req, res) => res.send('pong'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS === '*' ? '*' : ALLOWED_ORIGINS, methods: ['GET', 'POST'] } });

const PORT = process.env.PORT || 3001;

const { initDatabase } = require('./db/database');

(async () => {
  await initDatabase();

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/devices', require('./routes/devices'));
  app.use('/api/streams', require('./routes/streams'));
  app.use('/api/events', require('./routes/events'));
  app.use('/api/vmix', require('./routes/vmix'));
  app.use('/api/analytics', require('./routes/analytics'));
  app.use('/api/turn', require('./routes/turn'));

  const { setupWebSocketChannels } = require('./websocket/channels');
  setupWebSocketChannels(io);

  // SPA fallback — serve index.html for client-side routing in production
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '..', 'client', 'dist');
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n⚡ Pixel Perfect Broadcast Platform — Server running on port ${PORT}`);
    console.log(`   Dashboard: http://localhost:5173`);
    console.log(`   API:       http://localhost:${PORT}/api\n`);
  });
})();

process.on('uncaughtException', (err) => console.error('[ERROR] Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('[ERROR] Unhandled:', reason));