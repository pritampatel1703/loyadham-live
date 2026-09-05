const { helpers } = require('../db/database');

function setupWebSocketChannels(io) {
  const connectedDevices = new Map();
  const deviceSockets = new Map();

  const deviceNs = io.of('/devices');
  deviceNs.on('connection', (socket) => {
    console.log(`[WS/device] ${socket.id} connected`);

    socket.on('device:register', async ({ device_id, pairing_token }) => {
      try {
        const device = pairing_token ? await helpers.getDeviceByPairingToken(pairing_token) : await helpers.getDeviceById(device_id);
        if (!device) return socket.emit('device:error', { message: 'Invalid device' });
        connectedDevices.set(socket.id, device.id);
        deviceSockets.set(device.id, socket.id);
        await helpers.updateDeviceStatus(1, -1, -1, -1, '', 0, 0, '', '', device.id);
        await helpers.addLog(null, 'device', device.name, `"${device.name}" connected`, JSON.stringify({ device_id: device.id }));
        socket.emit('device:registered', { device_id: device.id, device_name: device.name });
        io.of('/production').emit('device:online', { device_id: device.id, device_name: device.name });
      } catch (err) {
        console.error('[WS/device:register] Error', err);
      }
    });

    socket.on('device:heartbeat', async (data) => {
      try {
        const did = connectedDevices.get(socket.id);
        if (!did) return;
        const { battery, signal, temperature, resolution, fps, bitrate, network_type, ip_address } = data;
        await helpers.updateDeviceStatus(1, battery??-1, signal??-1, temperature??-1, resolution||'', fps||0, bitrate||0, network_type||'', ip_address||'', did);
        await helpers.addSnapshot(did, null, bitrate||0, fps||0, 0, 0, battery??-1, signal??-1, resolution||'');
        io.of('/production').emit('device:heartbeat', { device_id: did, ...data });
      } catch (err) {
        console.error('[WS/device:heartbeat] Error', err);
      }
    });

    socket.on('disconnect', async () => {
      try {
        const did = connectedDevices.get(socket.id);
        if (did) {
          await helpers.setDeviceOffline(did);
          connectedDevices.delete(socket.id);
          deviceSockets.delete(did);
          await helpers.addLog(null, 'device', 'system', 'Device disconnected', JSON.stringify({ device_id: did }));
          io.of('/production').emit('device:offline', { device_id: did });
        }
      } catch (err) {
        console.error('[WS/device:disconnect] Error', err);
      }
    });
  });

  // In-memory state for active production feed and graphics
  let currentTally = { pgmId: null, pvwId: null };
  let currentOverlay = { active: false, title: 'Loyadham Live', subtitle: 'Global Broadcast' };

  const productionNs = io.of('/production');
  productionNs.on('connection', async (socket) => {
    try {
      socket.emit('devices:state', { devices: await helpers.getAllDevices() });
      socket.emit('streams:state', { streams: await helpers.getActiveStreams() });
      const ae = await helpers.getActiveEvent();
      if (ae) socket.emit('event:active', { event: ae });

      // Immediately send active PGM/PVW and overlay to newly opened windows/monitors
      socket.emit('tally-update', currentTally);
      if (currentTally.pgmId) socket.emit('device:tally', { deviceId: currentTally.pgmId, state: 'program' });
      socket.emit('overlay-update', currentOverlay);
      
      socket.on('get-tally', () => {
        socket.emit('tally-update', currentTally);
        if (currentTally.pgmId) socket.emit('device:tally', { deviceId: currentTally.pgmId, state: 'program' });
      });

      socket.on('log:subscribe', async ({ event_id, limit }) => {
        try {
          socket.emit('logs:history', { logs: event_id ? await helpers.getLogsByEvent(event_id, limit||50) : await helpers.getRecentLogs(limit||50) });
        } catch (err) { console.error('[WS/log:subscribe] Error', err); }
      });
      
      socket.on('tally-update', ({ pgmId, pvwId }) => {
        currentTally = { pgmId, pvwId };
        io.of('/devices').emit('tally-update', { pgmId, pvwId });
        // Broadcast to all clients on /production (including ProgramOutput)
        productionNs.emit('tally-update', { pgmId, pvwId });
        if (pgmId) {
          productionNs.emit('device:tally', { deviceId: pgmId, state: 'program' });
        }
        if (pvwId) {
          productionNs.emit('device:tally', { deviceId: pvwId, state: 'preview' });
        }
      });

      socket.on('overlay-update', (overlay) => {
        currentOverlay = overlay;
        productionNs.emit('overlay-update', overlay);
      });

      socket.on('camera-cmd', ({ deviceId, cmd, payload }) => {
        const targetSocketId = deviceSockets.get(deviceId);
        if (targetSocketId) {
          io.of('/devices').to(targetSocketId).emit('camera-cmd', { cmd, payload });
        }
      });
    } catch (err) {
      console.error('[WS/production:connection] Error', err);
    }
  });

  const signalingNs = io.of('/signaling');
  signalingNs.on('connection', (socket) => {
    socket.on('offer', ({ targetId, sdp, streamId }) => {
      signalingNs.to(targetId).emit('offer', { fromId: socket.id, sdp, streamId });
    });
    socket.on('answer', ({ targetId, sdp }) => {
      signalingNs.to(targetId).emit('answer', { fromId: socket.id, sdp });
    });
    socket.on('ice-candidate', ({ targetId, candidate, streamId }) => {
      signalingNs.to(targetId).emit('ice-candidate', { fromId: socket.id, candidate, streamId });
    });
    socket.on('join-room', ({ roomId }) => {
      socket.join(roomId);
      const room = signalingNs.adapter.rooms.get(roomId);
      const otherPeers = room ? Array.from(room).filter(id => id !== socket.id) : [];
      // Notify other peers in room that a new peer joined
      socket.to(roomId).emit('peer-joined', { peerId: socket.id, roomId });
      // Also notify this newly joined peer about existing peers in the room
      if (otherPeers.length > 0) {
        socket.emit('room-peers', { peers: otherPeers, roomId });
      }
    });
    socket.on('request-offer', ({ targetId, roomId }) => {
      if (targetId) {
        signalingNs.to(targetId).emit('need-offer', { fromId: socket.id, roomId });
      } else if (roomId) {
        socket.to(roomId).emit('need-offer', { fromId: socket.id, roomId });
      }
    });
    socket.on('leave-room', ({ roomId }) => {
      socket.leave(roomId);
      socket.to(roomId).emit('peer-left', { peerId: socket.id, roomId });
    });
  });

  // Default namespace — for public viewer pages (Home, Watch)
  const streamState = { active: false, title: '', viewerCount: 0, startedAt: null };
  io.on('connection', (socket) => {
    socket.emit('stream-state', streamState);

    socket.on('viewer-join', ({ username }) => {
      socket.data.username = username;
      streamState.viewerCount = io.engine.clientsCount;
      io.emit('viewer-count', streamState.viewerCount);
    });

    socket.on('start-stream', ({ title }) => {
      streamState.active = true;
      streamState.title = title || 'Loyadham Live';
      streamState.startedAt = new Date().toISOString();
      io.emit('stream-started', { title: streamState.title, startedAt: streamState.startedAt });
    });

    socket.on('stop-stream', () => {
      streamState.active = false;
      streamState.title = '';
      streamState.startedAt = null;
      io.emit('stream-ended');
    });

    socket.on('chat-message', (msg) => {
      io.emit('chat-message', { ...msg, id: Date.now(), timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', () => {
      streamState.viewerCount = Math.max(0, io.engine.clientsCount - 1);
      io.emit('viewer-count', streamState.viewerCount);
    });
  });
}

module.exports = { setupWebSocketChannels };
