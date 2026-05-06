const { helpers } = require('../db/database');

function setupWebSocketChannels(io) {
  const connectedDevices = new Map();
  const deviceSockets = new Map();

  const deviceNs = io.of('/devices');
  deviceNs.on('connection', (socket) => {
    console.log(`[WS/device] ${socket.id} connected`);

    socket.on('device:register', ({ device_id, pairing_token }) => {
      const device = pairing_token ? helpers.getDeviceByPairingToken(pairing_token) : helpers.getDeviceById(device_id);
      if (!device) return socket.emit('device:error', { message: 'Invalid device' });
      connectedDevices.set(socket.id, device.id);
      deviceSockets.set(device.id, socket.id);
      helpers.updateDeviceStatus(1, -1, -1, -1, '', 0, 0, '', '', device.id);
      helpers.addLog(null, 'device', device.name, `"${device.name}" connected`, JSON.stringify({ device_id: device.id }));
      socket.emit('device:registered', { device_id: device.id, device_name: device.name });
      io.of('/production').emit('device:online', { device_id: device.id, device_name: device.name });
    });

    socket.on('device:heartbeat', (data) => {
      const did = connectedDevices.get(socket.id);
      if (!did) return;
      const { battery, signal, temperature, resolution, fps, bitrate, network_type, ip_address } = data;
      helpers.updateDeviceStatus(1, battery??-1, signal??-1, temperature??-1, resolution||'', fps||0, bitrate||0, network_type||'', ip_address||'', did);
      helpers.addSnapshot(did, null, bitrate||0, fps||0, 0, 0, battery??-1, signal??-1, resolution||'');
      io.of('/production').emit('device:heartbeat', { device_id: did, ...data });
    });

    socket.on('disconnect', () => {
      const did = connectedDevices.get(socket.id);
      if (did) {
        helpers.setDeviceOffline(did);
        connectedDevices.delete(socket.id);
        deviceSockets.delete(did);
        helpers.addLog(null, 'device', 'system', 'Device disconnected', JSON.stringify({ device_id: did }));
        io.of('/production').emit('device:offline', { device_id: did });
      }
    });
  });

  const productionNs = io.of('/production');
  productionNs.on('connection', (socket) => {
    socket.emit('devices:state', { devices: helpers.getAllDevices() });
    socket.emit('streams:state', { streams: helpers.getActiveStreams() });
    const ae = helpers.getActiveEvent();
    if (ae) socket.emit('event:active', { event: ae });
    socket.on('log:subscribe', ({ event_id, limit }) => {
      socket.emit('logs:history', { logs: event_id ? helpers.getLogsByEvent(event_id, limit||50) : helpers.getRecentLogs(limit||50) });
    });
  });

  const signalingNs = io.of('/signaling');
  signalingNs.on('connection', (socket) => {
    socket.on('offer', ({ targetId, sdp, streamId }) => signalingNs.to(targetId).emit('offer', { fromId: socket.id, sdp, streamId }));
    socket.on('answer', ({ targetId, sdp }) => signalingNs.to(targetId).emit('answer', { fromId: socket.id, sdp }));
    socket.on('ice-candidate', ({ targetId, candidate }) => signalingNs.to(targetId).emit('ice-candidate', { fromId: socket.id, candidate }));
    socket.on('join-room', ({ roomId }) => { socket.join(roomId); socket.to(roomId).emit('peer-joined', { peerId: socket.id }); });
    socket.on('leave-room', ({ roomId }) => { socket.leave(roomId); socket.to(roomId).emit('peer-left', { peerId: socket.id }); });
  });
}

module.exports = { setupWebSocketChannels };
