const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pixelperfect',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 2000 // Fast fail if database is offline (Local Mode)
});

async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log('[DB] Connected to PostgreSQL');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await client.query(schema);

    // Seed default admin
    const adminCheck = await client.query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      const hash = bcrypt.hashSync('PixelPerfect@2026', 10);
      await client.query("INSERT INTO users (id, username, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5)",
        [uuidv4(), 'admin', hash, 'Super Admin', 'super_admin']);
      console.log('[DB] Default admin created — username: admin / password: PixelPerfect@2026');
    }

    // Seed default vMix connection
    const vmixCheck = await client.query("SELECT id FROM vmix_connections LIMIT 1");
    if (vmixCheck.rows.length === 0) {
      await client.query("INSERT INTO vmix_connections (id, name, host, port) VALUES ($1, $2, $3, $4)",
        [uuidv4(), 'Default vMix', '127.0.0.1', 8088]);
    }

    client.release();
    console.log('[DB] Database schema initialized');
  } catch (err) {
    console.error('[DB] Initialization error:', err);
  }
}

// ═══ Query Helpers & In-Memory Fallback ═══
// If PostgreSQL is not installed, the platform automatically switches to 'Offline Memory Mode'.
let dbOffline = false;
const memDB = {
  users: [], devices: [], streams: [], events: [], vmix: [], logs: [], analytics: [], layouts: []
};

pool.on('error', () => { dbOffline = true; });

async function checkDb() {
  if (dbOffline) return false;
  try { await pool.query('SELECT 1'); return true; } catch { dbOffline = true; return false; }
}

async function queryOne(sql, params = []) {
  if (await checkDb()) {
    try { const { rows } = await pool.query(sql, params); return rows[0] || null; } catch (e) {}
  }
  return mockDbQuery(sql, params, true);
}

async function queryAll(sql, params = []) {
  if (await checkDb()) {
    try { const { rows } = await pool.query(sql, params); return rows; } catch (e) {}
  }
  return mockDbQuery(sql, params, false);
}

async function run(sql, params = []) {
  if (await checkDb()) {
    try { return await pool.query(sql, params); } catch (e) {}
  }
  mockDbRun(sql, params);
  return { rowCount: 1 };
}

// ═══ Offline Mock Logic ═══
function mockDbQuery(sql, params, isOne) {
  let result = [];
  if (sql.includes('FROM devices')) result = memDB.devices;
  else if (sql.includes('FROM streams')) result = memDB.streams;
  else if (sql.includes('FROM events')) result = memDB.events;
  else if (sql.includes('FROM users')) result = memDB.users;
  else if (sql.includes('COUNT')) return isOne ? { count: 0 } : [{ count: 0 }];
  
  if (sql.includes('WHERE id')) {
    result = result.filter(r => r.id === params[0]);
  } else if (sql.includes('WHERE pairing_token')) {
    result = result.filter(r => r.pairing_token === params[0]);
  }
  
  return isOne ? (result[0] || null) : result;
}

function mockDbRun(sql, params) {
  if (sql.includes('INSERT INTO devices')) {
    memDB.devices.push({ id: params[0], name: params[1], label: params[2], group_name: params[3], pairing_token: params[4], is_online: 0, battery_percent: 100, signal_quality: 100 });
  } else if (sql.includes('UPDATE devices SET is_online')) {
    const d = memDB.devices.find(x => x.id === params[9] || x.id === params[0]);
    if (d) { d.is_online = params[0] === 1 ? 1 : 0; }
  } else if (sql.includes('INSERT INTO events')) {
    memDB.events.push({ id: params[0], title: params[1], description: params[2], status: params[3] });
  }
}

// ═══ Prepared-style helpers ═══
const helpers = {
  // Users
  getUserByUsername: (username) => queryOne('SELECT * FROM users WHERE username = $1', [username]),
  getUserById: (id) => queryOne('SELECT id, username, display_name, role, avatar, created_at, last_login FROM users WHERE id = $1', [id]),
  getAllUsers: () => queryAll('SELECT id, username, display_name, role, avatar, created_at, last_login FROM users ORDER BY created_at DESC'),
  createUser: (id, username, hash, display_name, role) => run('INSERT INTO users (id, username, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5)', [id, username, hash, display_name, role]),
  updateUserRole: (role, id) => run("UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [role, id]),
  updateLastLogin: (id) => run("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1", [id]),
  deleteUser: (id) => run('DELETE FROM users WHERE id = $1', [id]),

  // Devices
  getAllDevices: () => queryAll('SELECT * FROM devices ORDER BY is_online DESC, name ASC'),
  getDeviceById: (id) => queryOne('SELECT * FROM devices WHERE id = $1', [id]),
  getDeviceByPairingToken: (token) => queryOne('SELECT * FROM devices WHERE pairing_token = $1', [token]),
  getOnlineDevices: () => queryAll('SELECT * FROM devices WHERE is_online = 1'),
  getDevicesByGroup: (group) => queryAll('SELECT * FROM devices WHERE group_name = $1', [group]),
  createDevice: (id, name, label, group_name, token) => run('INSERT INTO devices (id, name, label, group_name, pairing_token) VALUES ($1, $2, $3, $4, $5)', [id, name, label, group_name, token]),
  updateDeviceStatus: (online, battery, signal, temp, res, fps, bitrate, network, ip, id) =>
    run("UPDATE devices SET is_online=$1, last_active=CURRENT_TIMESTAMP, battery_percent=$2, signal_quality=$3, temperature=$4, stream_resolution=$5, stream_fps=$6, stream_bitrate=$7, network_type=$8, ip_address=$9, updated_at=CURRENT_TIMESTAMP WHERE id=$10",
      [online, battery, signal, temp, res, fps, bitrate, network, ip, id]),
  updateDeviceInfo: (name, label, group, id) => run("UPDATE devices SET name=$1, label=$2, group_name=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4", [name, label, group, id]),
  setDeviceOffline: (id) => run("UPDATE devices SET is_online=0, updated_at=CURRENT_TIMESTAMP WHERE id=$1", [id]),
  updateTallyState: (state, id) => run("UPDATE devices SET tally_state=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2", [state, id]),
  deleteDevice: (id) => run('DELETE FROM devices WHERE id = $1', [id]),

  // Device Tags
  getDeviceTags: (deviceId) => queryAll('SELECT tag FROM device_tags WHERE device_id = $1', [deviceId]),
  addDeviceTag: (deviceId, tag) => run('INSERT INTO device_tags (device_id, tag) VALUES ($1, $2) ON CONFLICT (device_id, tag) DO NOTHING', [deviceId, tag]),
  removeDeviceTag: (deviceId, tag) => run('DELETE FROM device_tags WHERE device_id = $1 AND tag = $2', [deviceId, tag]),

  // Streams
  getAllStreams: () => queryAll('SELECT * FROM streams ORDER BY created_at DESC'),
  getActiveStreams: () => queryAll("SELECT * FROM streams WHERE status IN ('connecting','live')"),
  getStreamById: (id) => queryOne('SELECT * FROM streams WHERE id = $1', [id]),
  getStreamsByDevice: (deviceId) => queryAll('SELECT * FROM streams WHERE device_id = $1 ORDER BY created_at DESC LIMIT 10', [deviceId]),
  createStream: (id, deviceId, url, protocol, status, res, fps, bitrate, codec) =>
    run('INSERT INTO streams (id, device_id, endpoint_url, protocol, status, resolution, fps, bitrate, codec) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, deviceId, url, protocol, status, res, fps, bitrate, codec]),
  updateStreamStatus: (status, latency, loss, uptime, id) => run('UPDATE streams SET status=$1, latency_ms=$2, packet_loss=$3, uptime_seconds=$4 WHERE id=$5', [status, latency, loss, uptime, id]),
  updateStreamMetrics: (bitrate, fps, latency, loss, res, uptime, id) => run('UPDATE streams SET bitrate=$1, fps=$2, latency_ms=$3, packet_loss=$4, resolution=$5, uptime_seconds=$6 WHERE id=$7', [bitrate, fps, latency, loss, res, uptime, id]),
  endStream: (id) => run("UPDATE streams SET status='ended', ended_at=CURRENT_TIMESTAMP WHERE id=$1", [id]),

  // Events
  getAllEvents: () => queryAll('SELECT * FROM events ORDER BY created_at DESC'),
  getEventById: (id) => queryOne('SELECT * FROM events WHERE id = $1', [id]),
  getActiveEvent: () => queryOne("SELECT * FROM events WHERE status = 'live' LIMIT 1"),
  getScheduledEvents: () => queryAll("SELECT * FROM events WHERE status = 'scheduled' ORDER BY scheduled_start ASC"),
  createEvent: (id, title, desc, status, start, end, preset, layout, template, createdBy) =>
    run('INSERT INTO events (id,title,description,status,scheduled_start,scheduled_end,scene_preset,layout_config,production_template,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, title, desc, status, start, end, preset, layout, template, createdBy]),
  updateEvent: (title, desc, status, start, end, preset, layout, template, id) =>
    run("UPDATE events SET title=$1,description=$2,status=$3,scheduled_start=$4,scheduled_end=$5,scene_preset=$6,layout_config=$7,production_template=$8,updated_at=CURRENT_TIMESTAMP WHERE id=$9",
      [title, desc, status, start, end, preset, layout, template, id]),
  updateEventStatus: (status, id) => run("UPDATE events SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2", [status, id]),
  startEvent: (id) => run("UPDATE events SET status='live',actual_start=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [id]),
  endEvent: (id) => run("UPDATE events SET status='completed',actual_end=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [id]),
  deleteEvent: (id) => run('DELETE FROM events WHERE id=$1', [id]),

  // Camera Assignments
  getEventAssignments: (eventId) => queryAll('SELECT ca.*, d.name as device_name, d.is_online FROM camera_assignments ca LEFT JOIN devices d ON ca.device_id = d.id WHERE ca.event_id = $1 ORDER BY ca.sort_order', [eventId]),
  assignCamera: (eventId, deviceId, role, label, order) => run('INSERT INTO camera_assignments (event_id,device_id,role,position_label,sort_order) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id, device_id) DO UPDATE SET role=$3, position_label=$4, sort_order=$5', [eventId, deviceId, role, label, order]),
  removeAssignment: (eventId, deviceId) => run('DELETE FROM camera_assignments WHERE event_id=$1 AND device_id=$2', [eventId, deviceId]),

  // vMix
  getAllVmixConnections: () => queryAll('SELECT * FROM vmix_connections'),
  getVmixById: (id) => queryOne('SELECT * FROM vmix_connections WHERE id=$1', [id]),
  createVmixConnection: (id, name, host, port) => run('INSERT INTO vmix_connections (id,name,host,port) VALUES ($1,$2,$3,$4)', [id, name, host, port]),
  updateVmixConnection: (name, host, port, autoReconnect, id) => run('UPDATE vmix_connections SET name=$1,host=$2,port=$3,auto_reconnect=$4 WHERE id=$5', [name, host, port, autoReconnect, id]),
  updateVmixStatus: (connected, id) => run("UPDATE vmix_connections SET is_connected=$1,last_connected=CURRENT_TIMESTAMP WHERE id=$2", [connected, id]),
  updateVmixError: (error, id) => run('UPDATE vmix_connections SET is_connected=0,last_error=$1 WHERE id=$2', [error, id]),
  deleteVmixConnection: (id) => run('DELETE FROM vmix_connections WHERE id=$1', [id]),

  // Production Logs
  getRecentLogs: (limit) => queryAll('SELECT * FROM production_logs ORDER BY created_at DESC LIMIT $1', [limit]),
  getLogsByEvent: (eventId, limit) => queryAll('SELECT * FROM production_logs WHERE event_id=$1 ORDER BY created_at DESC LIMIT $2', [eventId, limit]),
  getLogsByType: (type, limit) => queryAll('SELECT * FROM production_logs WHERE type=$1 ORDER BY created_at DESC LIMIT $2', [type, limit]),
  addLog: (eventId, type, source, message, metadata) => run('INSERT INTO production_logs (event_id,type,source,message,metadata) VALUES ($1,$2,$3,$4,$5)', [eventId, type, source, message, metadata]),

  // Analytics
  addSnapshot: (deviceId, streamId, bitrate, fps, latency, loss, battery, signal, res) =>
    run('INSERT INTO analytics_snapshots (device_id,stream_id,bitrate,fps,latency_ms,packet_loss,battery_percent,signal_quality,resolution) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [deviceId, streamId, bitrate, fps, latency, loss, battery, signal, res]),
  getDeviceAnalytics: (deviceId, limit) => queryAll('SELECT * FROM analytics_snapshots WHERE device_id=$1 ORDER BY created_at DESC LIMIT $2', [deviceId, limit]),
  getRecentAnalytics: (limit) => queryAll('SELECT * FROM analytics_snapshots ORDER BY created_at DESC LIMIT $1', [limit]),
  getAnalyticsSummary: () => queryAll("SELECT device_id, AVG(bitrate) as avg_bitrate, AVG(fps) as avg_fps, AVG(latency_ms) as avg_latency, AVG(packet_loss) as avg_packet_loss, COUNT(*) as sample_count FROM analytics_snapshots WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY device_id"),

  // Settings
  getSetting: (key) => queryOne('SELECT value FROM settings WHERE key=$1', [key]),
  getAllSettings: () => queryAll('SELECT * FROM settings ORDER BY category, key'),
  getSettingsByCategory: (cat) => queryAll('SELECT * FROM settings WHERE category=$1', [cat]),
  setSetting: (key, value, cat) => run("INSERT INTO settings (key,value,category,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value=$2, category=$3, updated_at=CURRENT_TIMESTAMP", [key, value, cat]),

  // Layouts
  getAllLayouts: () => queryAll('SELECT * FROM layouts ORDER BY created_at DESC'),
  getLayoutById: (id) => queryOne('SELECT * FROM layouts WHERE id=$1', [id]),
  createLayout: (id, name, desc, config, createdBy) => run('INSERT INTO layouts (id,name,description,config,created_by) VALUES ($1,$2,$3,$4,$5)', [id, name, desc, config, createdBy]),
  deleteLayout: (id) => run('DELETE FROM layouts WHERE id=$1', [id]),

  // Dashboard
  countOnlineDevices: () => queryOne('SELECT COUNT(*) as count FROM devices WHERE is_online=1'),
  countActiveStreams: () => queryOne("SELECT COUNT(*) as count FROM streams WHERE status='live'"),
  countTotalDevices: () => queryOne('SELECT COUNT(*) as count FROM devices'),
  countTotalEvents: () => queryOne('SELECT COUNT(*) as count FROM events'),
};

module.exports = { initDatabase, helpers, getPool: () => pool };
