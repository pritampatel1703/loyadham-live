/**
 * RTMP Ingest Server — for DJI Pocket 3, GoPro, and other RTMP cameras
 *
 * Architecture:
 *   Camera (DJI/GoPro) --RTMP--> This Server --HTTP-FLV--> Browser (Production Dashboard)
 *
 * Ports:
 *   RTMP: 1935 (cameras push here)
 *   HTTP-FLV: 8000 (browser plays from here)
 *
 * Usage:
 *   Camera RTMP URL:  rtmp://<server-ip>:1935/live/<stream-key>
 *   Browser FLV URL:  http://<server-ip>:8000/live/<stream-key>.flv
 *
 * Environment:
 *   ENABLE_RTMP=true   — required to start the RTMP server
 *   RTMP_PORT=1935     — RTMP listening port (default: 1935)
 *   RTMP_HTTP_PORT=8000 — HTTP-FLV port (default: 8000)
 */

let NodeMediaServer;
try {
  NodeMediaServer = require('node-media-server');
} catch (e) {
  // node-media-server not installed — RTMP feature unavailable
}

// Track active RTMP streams
const activeStreams = new Map(); // streamPath -> { startTime, ip, app, stream }

function setupRtmpServer(io) {
  if (!NodeMediaServer) {
    console.log('[RTMP] node-media-server not installed — RTMP ingest disabled');
    return null;
  }

  if (process.env.ENABLE_RTMP !== 'true') {
    console.log('[RTMP] RTMP ingest disabled (set ENABLE_RTMP=true to enable)');
    return null;
  }

  const rtmpPort = parseInt(process.env.RTMP_PORT || '1935', 10);
  const httpPort = parseInt(process.env.RTMP_HTTP_PORT || '8000', 10);

  const config = {
    logType: 1, // 0=none, 1=error, 2=normal, 3=debug
    rtmp: {
      port: rtmpPort,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60,
    },
    http: {
      port: httpPort,
      allow_origin: '*',
      mediaroot: './media',
    },
  };

  const nms = new NodeMediaServer(config);

  // Log stream events
  nms.on('preConnect', (id, args) => {
    console.log('[RTMP] Client connecting:', id, args);
  });

  nms.on('postConnect', (id, args) => {
    console.log('[RTMP] Client connected:', id);
  });

  nms.on('prePublish', (id, streamPath, args) => {
    console.log('[RTMP] Stream starting:', streamPath);
    // streamPath format: /live/streamKey
    const parts = streamPath.split('/');
    const streamKey = parts[parts.length - 1];

    activeStreams.set(streamPath, {
      id,
      streamKey,
      startTime: Date.now(),
      app: parts[1] || 'live',
    });

    // Notify production dashboard
    if (io) {
      io.of('/production').emit('rtmp:stream-start', {
        streamKey,
        streamPath,
        flvUrl: `/rtmp-flv${streamPath}.flv`,
      });
    }
  });

  nms.on('donePublish', (id, streamPath, args) => {
    console.log('[RTMP] Stream ended:', streamPath);
    const parts = streamPath.split('/');
    const streamKey = parts[parts.length - 1];

    activeStreams.delete(streamPath);

    if (io) {
      io.of('/production').emit('rtmp:stream-end', { streamKey, streamPath });
    }
  });

  nms.on('doneConnect', (id, args) => {
    console.log('[RTMP] Client disconnected:', id);
  });

  try {
    nms.run();
    console.log(`[RTMP] ✅ RTMP server running on rtmp://0.0.0.0:${rtmpPort}`);
    console.log(`[RTMP] ✅ HTTP-FLV server running on http://0.0.0.0:${httpPort}`);
    console.log(`[RTMP] 📷 Camera RTMP URL: rtmp://<your-ip>:${rtmpPort}/live/<stream-key>`);
    console.log(`[RTMP] 🌐 Browser FLV URL: http://<your-ip>:${httpPort}/live/<stream-key>.flv`);
  } catch (err) {
    console.error('[RTMP] Failed to start:', err.message);
    return null;
  }

  return nms;
}

function getActiveStreams() {
  return Array.from(activeStreams.entries()).map(([path, info]) => ({
    streamPath: path,
    streamKey: info.streamKey,
    app: info.app,
    uptime: Math.floor((Date.now() - info.startTime) / 1000),
  }));
}

module.exports = { setupRtmpServer, getActiveStreams };
