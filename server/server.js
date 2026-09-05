require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();

// === LOCAL RENDERLESS MODE ===
// Prevent server from crashing and shutting down port 4000 if the offline database throws errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH PREVENTED] Unhandled Rejection:', reason.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[CRASH PREVENTED] Uncaught Exception:', err.message || err);
});

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
  app.use('/api/atem', require('./routes/atem'));
  app.use('/api/analytics', require('./routes/analytics'));
  app.use('/api/turn', require('./routes/turn'));
  app.use('/api/rtmp', require('./routes/rtmp'));

  app.set('io', io);

  // RTMP-FLV Proxy — allows viewing RTMP streams through port 4000 (bypasses firewall/CORS issues)
  app.get('/rtmp-flv/*', (req, res) => {
    const streamPath = req.params[0]; // e.g. "live/dji1.flv"
    const rtmpHttpPort = process.env.RTMP_HTTP_PORT || '8009';
    const targetUrl = `http://127.0.0.1:${rtmpHttpPort}/${streamPath}`;
    
    const http = require('http');
    http.get(targetUrl, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }).on('error', (err) => {
      res.status(500).send('RTMP Proxy Error: ' + err.message);
    });
  });

  const { setupWebSocketChannels } = require('./websocket/channels');
  setupWebSocketChannels(io);

  // Start RTMP ingest server (for DJI Pocket 3, GoPro, etc.)
  // Only starts when ENABLE_RTMP=true is set
  const { setupRtmpServer } = require('./rtmp/rtmpServer');
  setupRtmpServer(io);

  // SPA fallback — serve index.html for client-side routing in production
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '..', 'client', 'dist');
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  server.listen(PORT, () => {
    console.log(`\n⚡ Pixel Perfect Broadcast Platform — Server running on port ${PORT}`);
    console.log(`   Dashboard: http://localhost:${PORT}`);
    console.log(`   API:       http://localhost:${PORT}/api\n`);
  });
})();

process.on('uncaughtException', (err) => console.error('[ERROR] Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('[ERROR] Unhandled:', reason));