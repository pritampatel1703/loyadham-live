const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));

// Health check — required for Render to confirm the server is running
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ─── Single Stream State ────────────────────────────────────────────────────
let stream = {
  active: false,
  title: '',
  adminSocketId: null,
  startedAt: null,
};

// viewers: Map<socketId, { username }>
const viewers = new Map();

function viewerCount() {
  return viewers.size;
}

// ─── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // Send current stream state immediately on connect
  socket.emit('stream-state', {
    active: stream.active,
    title: stream.title,
    viewerCount: viewerCount(),
    startedAt: stream.startedAt,
  });

  // ── ADMIN: Go Live ─────────────────────────────────────────────────────────
  socket.on('admin-go-live', ({ title }) => {
    stream = {
      active: true,
      title: title || 'Loyadham Live',
      adminSocketId: socket.id,
      startedAt: new Date().toISOString(),
    };
    console.log(`[LIVE] "${stream.title}"`);

    // Notify all viewers the stream started
    socket.broadcast.emit('stream-started', {
      title: stream.title,
      startedAt: stream.startedAt,
    });
    io.emit('viewer-count', viewerCount());

    // Create offers for any viewers already waiting in the room
    viewers.forEach((_, viewerId) => {
      socket.emit('new-viewer', { viewerId });
    });
  });

  // ── ADMIN: End Stream ──────────────────────────────────────────────────────
  socket.on('admin-end-stream', () => {
    stream = { active: false, title: '', adminSocketId: null, startedAt: null };
    viewers.clear();
    console.log('[OFFLINE] Stream ended by admin');
    io.emit('stream-ended');
    io.emit('viewer-count', 0);
  });

  // ── VIEWER: Join ───────────────────────────────────────────────────────────
  socket.on('viewer-join', ({ username }) => {
    const name = (username || 'Guest').slice(0, 40);
    viewers.set(socket.id, { username: name });
    console.log(`[VIEWER+] ${name} — total: ${viewerCount()}`);
    io.emit('viewer-count', viewerCount());

    // Tell the admin to create an offer for this viewer
    if (stream.adminSocketId) {
      io.to(stream.adminSocketId).emit('new-viewer', { viewerId: socket.id });
    }
  });

  // ── WebRTC Signaling ───────────────────────────────────────────────────────
  socket.on('offer', ({ targetId, sdp }) => {
    io.to(targetId).emit('offer', { fromId: socket.id, sdp });
  });

  socket.on('answer', ({ targetId, sdp }) => {
    io.to(targetId).emit('answer', { fromId: socket.id, sdp });
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { fromId: socket.id, candidate });
  });

  // ── Chat ───────────────────────────────────────────────────────────────────
  socket.on('chat-message', ({ username, message, isAdmin }) => {
    const safe = String(message).slice(0, 500);
    io.emit('chat-message', {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      username: String(username).slice(0, 40),
      message: safe,
      isAdmin: !!isAdmin,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);

    if (socket.id === stream.adminSocketId) {
      // Admin left — end the stream
      stream = { active: false, title: '', adminSocketId: null, startedAt: null };
      viewers.clear();
      io.emit('stream-ended');
      io.emit('viewer-count', 0);
      console.log('[OFFLINE] Admin disconnected — stream ended');
    } else if (viewers.has(socket.id)) {
      const v = viewers.get(socket.id);
      viewers.delete(socket.id);
      io.emit('viewer-count', viewerCount());
      if (stream.adminSocketId) {
        io.to(stream.adminSocketId).emit('viewer-left', { viewerId: socket.id });
      }
      console.log(`[VIEWER-] ${v.username} — total: ${viewerCount()}`);
    }
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🕉️  Loyadham Live Server running on port ${PORT}\n`);
});

// Catch unhandled errors so the process doesn't silently die on Render
process.on('uncaughtException', (err) => {
  console.error('[ERROR] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[ERROR] Unhandled rejection:', reason);
});
