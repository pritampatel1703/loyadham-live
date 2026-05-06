const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'antigravity.db');

let db = null;

// Auto-save to disk every 30 seconds and on changes
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveToDisk(); }, 5000);
}
function saveToDisk() {
  if (!db) return;
  try { const data = db.export(); fs.writeFileSync(DB_PATH, Buffer.from(data)); } catch (e) { console.error('[DB] Save error:', e); }
}

/**
 * Initialize database
 */
async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.run(schema);

  // Seed default admin
  const adminCheck = db.exec("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
  if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
    const hash = bcrypt.hashSync('PixelPerfect@2026', 10);
    db.run("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)",
      [uuidv4(), 'admin', hash, 'Super Admin', 'super_admin']);
    console.log('[DB] Default admin created — username: admin / password: PixelPerfect@2026');
  }

  // Seed default vMix connection
  const vmixCheck = db.exec("SELECT id FROM vmix_connections LIMIT 1");
  if (vmixCheck.length === 0 || vmixCheck[0].values.length === 0) {
    db.run("INSERT INTO vmix_connections (id, name, host, port) VALUES (?, ?, ?, ?)",
      [uuidv4(), 'Default vMix', '127.0.0.1', 8088]);
  }

  saveToDisk();
  console.log('[DB] Database initialized at', DB_PATH);
}

// ═══ Query Helpers ═══

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    stmt.free();
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
  }
  stmt.free();
  return null;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  const cols = stmt.getColumnNames();
  while (stmt.step()) {
    const vals = stmt.get();
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    results.push(obj);
  }
  stmt.free();
  return results;
}

function run(sql, params = []) {
  db.run(sql, params);
  scheduleSave();
}

// ═══ Prepared-style helpers ═══
const helpers = {
  // Users
  getUserByUsername: (username) => queryOne('SELECT * FROM users WHERE username = ?', [username]),
  getUserById: (id) => queryOne('SELECT id, username, display_name, role, avatar, created_at, last_login FROM users WHERE id = ?', [id]),
  getAllUsers: () => queryAll('SELECT id, username, display_name, role, avatar, created_at, last_login FROM users ORDER BY created_at DESC'),
  createUser: (id, username, hash, display_name, role) => run('INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)', [id, username, hash, display_name, role]),
  updateUserRole: (role, id) => run("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?", [role, id]),
  updateLastLogin: (id) => run("UPDATE users SET last_login = datetime('now') WHERE id = ?", [id]),
  deleteUser: (id) => run('DELETE FROM users WHERE id = ?', [id]),

  // Devices
  getAllDevices: () => queryAll('SELECT * FROM devices ORDER BY is_online DESC, name ASC'),
  getDeviceById: (id) => queryOne('SELECT * FROM devices WHERE id = ?', [id]),
  getDeviceByPairingToken: (token) => queryOne('SELECT * FROM devices WHERE pairing_token = ?', [token]),
  getOnlineDevices: () => queryAll('SELECT * FROM devices WHERE is_online = 1'),
  getDevicesByGroup: (group) => queryAll('SELECT * FROM devices WHERE group_name = ?', [group]),
  createDevice: (id, name, label, group_name, token) => run('INSERT INTO devices (id, name, label, group_name, pairing_token) VALUES (?, ?, ?, ?, ?)', [id, name, label, group_name, token]),
  updateDeviceStatus: (online, battery, signal, temp, res, fps, bitrate, network, ip, id) =>
    run("UPDATE devices SET is_online=?, last_active=datetime('now'), battery_percent=?, signal_quality=?, temperature=?, stream_resolution=?, stream_fps=?, stream_bitrate=?, network_type=?, ip_address=?, updated_at=datetime('now') WHERE id=?",
      [online, battery, signal, temp, res, fps, bitrate, network, ip, id]),
  updateDeviceInfo: (name, label, group, id) => run("UPDATE devices SET name=?, label=?, group_name=?, updated_at=datetime('now') WHERE id=?", [name, label, group, id]),
  setDeviceOffline: (id) => run("UPDATE devices SET is_online=0, updated_at=datetime('now') WHERE id=?", [id]),
  updateTallyState: (state, id) => run("UPDATE devices SET tally_state=?, updated_at=datetime('now') WHERE id=?", [state, id]),
  deleteDevice: (id) => run('DELETE FROM devices WHERE id = ?', [id]),

  // Device Tags
  getDeviceTags: (deviceId) => queryAll('SELECT tag FROM device_tags WHERE device_id = ?', [deviceId]),
  addDeviceTag: (deviceId, tag) => run('INSERT OR IGNORE INTO device_tags (device_id, tag) VALUES (?, ?)', [deviceId, tag]),
  removeDeviceTag: (deviceId, tag) => run('DELETE FROM device_tags WHERE device_id = ? AND tag = ?', [deviceId, tag]),

  // Streams
  getAllStreams: () => queryAll('SELECT * FROM streams ORDER BY created_at DESC'),
  getActiveStreams: () => queryAll("SELECT * FROM streams WHERE status IN ('connecting','live')"),
  getStreamById: (id) => queryOne('SELECT * FROM streams WHERE id = ?', [id]),
  getStreamsByDevice: (deviceId) => queryAll('SELECT * FROM streams WHERE device_id = ? ORDER BY created_at DESC LIMIT 10', [deviceId]),
  createStream: (id, deviceId, url, protocol, status, res, fps, bitrate, codec) =>
    run('INSERT INTO streams (id, device_id, endpoint_url, protocol, status, resolution, fps, bitrate, codec) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, deviceId, url, protocol, status, res, fps, bitrate, codec]),
  updateStreamStatus: (status, latency, loss, uptime, id) => run('UPDATE streams SET status=?, latency_ms=?, packet_loss=?, uptime_seconds=? WHERE id=?', [status, latency, loss, uptime, id]),
  updateStreamMetrics: (bitrate, fps, latency, loss, res, uptime, id) => run('UPDATE streams SET bitrate=?, fps=?, latency_ms=?, packet_loss=?, resolution=?, uptime_seconds=? WHERE id=?', [bitrate, fps, latency, loss, res, uptime, id]),
  endStream: (id) => run("UPDATE streams SET status='ended', ended_at=datetime('now') WHERE id=?", [id]),

  // Events
  getAllEvents: () => queryAll('SELECT * FROM events ORDER BY created_at DESC'),
  getEventById: (id) => queryOne('SELECT * FROM events WHERE id = ?', [id]),
  getActiveEvent: () => queryOne("SELECT * FROM events WHERE status = 'live' LIMIT 1"),
  getScheduledEvents: () => queryAll("SELECT * FROM events WHERE status = 'scheduled' ORDER BY scheduled_start ASC"),
  createEvent: (id, title, desc, status, start, end, preset, layout, template, createdBy) =>
    run('INSERT INTO events (id,title,description,status,scheduled_start,scheduled_end,scene_preset,layout_config,production_template,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, title, desc, status, start, end, preset, layout, template, createdBy]),
  updateEvent: (title, desc, status, start, end, preset, layout, template, id) =>
    run("UPDATE events SET title=?,description=?,status=?,scheduled_start=?,scheduled_end=?,scene_preset=?,layout_config=?,production_template=?,updated_at=datetime('now') WHERE id=?",
      [title, desc, status, start, end, preset, layout, template, id]),
  updateEventStatus: (status, id) => run("UPDATE events SET status=?,updated_at=datetime('now') WHERE id=?", [status, id]),
  startEvent: (id) => run("UPDATE events SET status='live',actual_start=datetime('now'),updated_at=datetime('now') WHERE id=?", [id]),
  endEvent: (id) => run("UPDATE events SET status='completed',actual_end=datetime('now'),updated_at=datetime('now') WHERE id=?", [id]),
  deleteEvent: (id) => run('DELETE FROM events WHERE id=?', [id]),

  // Camera Assignments
  getEventAssignments: (eventId) => queryAll('SELECT ca.*, d.name as device_name, d.is_online FROM camera_assignments ca LEFT JOIN devices d ON ca.device_id = d.id WHERE ca.event_id = ? ORDER BY ca.sort_order', [eventId]),
  assignCamera: (eventId, deviceId, role, label, order) => run('INSERT OR REPLACE INTO camera_assignments (event_id,device_id,role,position_label,sort_order) VALUES (?,?,?,?,?)', [eventId, deviceId, role, label, order]),
  removeAssignment: (eventId, deviceId) => run('DELETE FROM camera_assignments WHERE event_id=? AND device_id=?', [eventId, deviceId]),

  // vMix
  getAllVmixConnections: () => queryAll('SELECT * FROM vmix_connections'),
  getVmixById: (id) => queryOne('SELECT * FROM vmix_connections WHERE id=?', [id]),
  createVmixConnection: (id, name, host, port) => run('INSERT INTO vmix_connections (id,name,host,port) VALUES (?,?,?,?)', [id, name, host, port]),
  updateVmixConnection: (name, host, port, autoReconnect, id) => run('UPDATE vmix_connections SET name=?,host=?,port=?,auto_reconnect=? WHERE id=?', [name, host, port, autoReconnect, id]),
  updateVmixStatus: (connected, id) => run("UPDATE vmix_connections SET is_connected=?,last_connected=datetime('now') WHERE id=?", [connected, id]),
  updateVmixError: (error, id) => run('UPDATE vmix_connections SET is_connected=0,last_error=? WHERE id=?', [error, id]),
  deleteVmixConnection: (id) => run('DELETE FROM vmix_connections WHERE id=?', [id]),

  // Production Logs
  getRecentLogs: (limit) => queryAll('SELECT * FROM production_logs ORDER BY created_at DESC LIMIT ?', [limit]),
  getLogsByEvent: (eventId, limit) => queryAll('SELECT * FROM production_logs WHERE event_id=? ORDER BY created_at DESC LIMIT ?', [eventId, limit]),
  getLogsByType: (type, limit) => queryAll('SELECT * FROM production_logs WHERE type=? ORDER BY created_at DESC LIMIT ?', [type, limit]),
  addLog: (eventId, type, source, message, metadata) => run('INSERT INTO production_logs (event_id,type,source,message,metadata) VALUES (?,?,?,?,?)', [eventId, type, source, message, metadata]),

  // Analytics
  addSnapshot: (deviceId, streamId, bitrate, fps, latency, loss, battery, signal, res) =>
    run('INSERT INTO analytics_snapshots (device_id,stream_id,bitrate,fps,latency_ms,packet_loss,battery_percent,signal_quality,resolution) VALUES (?,?,?,?,?,?,?,?,?)',
      [deviceId, streamId, bitrate, fps, latency, loss, battery, signal, res]),
  getDeviceAnalytics: (deviceId, limit) => queryAll('SELECT * FROM analytics_snapshots WHERE device_id=? ORDER BY created_at DESC LIMIT ?', [deviceId, limit]),
  getRecentAnalytics: (limit) => queryAll('SELECT * FROM analytics_snapshots ORDER BY created_at DESC LIMIT ?', [limit]),
  getAnalyticsSummary: () => queryAll("SELECT device_id, AVG(bitrate) as avg_bitrate, AVG(fps) as avg_fps, AVG(latency_ms) as avg_latency, AVG(packet_loss) as avg_packet_loss, COUNT(*) as sample_count FROM analytics_snapshots WHERE created_at > datetime('now','-1 hour') GROUP BY device_id"),

  // Settings
  getSetting: (key) => queryOne('SELECT value FROM settings WHERE key=?', [key]),
  getAllSettings: () => queryAll('SELECT * FROM settings ORDER BY category, key'),
  getSettingsByCategory: (cat) => queryAll('SELECT * FROM settings WHERE category=?', [cat]),
  setSetting: (key, value, cat) => run("INSERT OR REPLACE INTO settings (key,value,category,updated_at) VALUES (?,?,?,datetime('now'))", [key, value, cat]),

  // Layouts
  getAllLayouts: () => queryAll('SELECT * FROM layouts ORDER BY created_at DESC'),
  getLayoutById: (id) => queryOne('SELECT * FROM layouts WHERE id=?', [id]),
  createLayout: (id, name, desc, config, createdBy) => run('INSERT INTO layouts (id,name,description,config,created_by) VALUES (?,?,?,?,?)', [id, name, desc, config, createdBy]),
  deleteLayout: (id) => run('DELETE FROM layouts WHERE id=?', [id]),

  // Dashboard
  countOnlineDevices: () => queryOne('SELECT COUNT(*) as count FROM devices WHERE is_online=1'),
  countActiveStreams: () => queryOne("SELECT COUNT(*) as count FROM streams WHERE status='live'"),
  countTotalDevices: () => queryOne('SELECT COUNT(*) as count FROM devices'),
  countTotalEvents: () => queryOne('SELECT COUNT(*) as count FROM events'),
};

// Save on process exit
process.on('exit', saveToDisk);
process.on('SIGINT', () => { saveToDisk(); process.exit(); });

module.exports = { initDatabase, helpers, getDb: () => db };
