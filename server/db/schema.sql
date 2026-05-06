-- ═══════════════════════════════════════════════════════════════
-- PIXEL PERFECT — Broadcast Production Platform Database Schema (PostgreSQL)
-- ═══════════════════════════════════════════════════════════════

-- Users & Roles
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('super_admin','production_admin','operator','camera_operator','viewer')),
  avatar TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Devices (Android camera units)
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Camera',
  label TEXT DEFAULT '',
  group_name TEXT DEFAULT 'Default',
  pairing_token TEXT UNIQUE,
  is_online INTEGER NOT NULL DEFAULT 0,
  last_active TIMESTAMP WITH TIME ZONE,
  battery_percent INTEGER DEFAULT -1,
  signal_quality INTEGER DEFAULT -1,
  temperature REAL DEFAULT -1,
  stream_resolution TEXT DEFAULT '',
  stream_fps INTEGER DEFAULT 0,
  stream_bitrate INTEGER DEFAULT 0,
  stream_codec TEXT DEFAULT 'H264',
  network_type TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  device_model TEXT DEFAULT '',
  os_version TEXT DEFAULT '',
  app_version TEXT DEFAULT '',
  latitude REAL DEFAULT 0,
  longitude REAL DEFAULT 0,
  tally_state TEXT DEFAULT 'off' CHECK(tally_state IN ('off','preview','program')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Device Tags
CREATE TABLE IF NOT EXISTS device_tags (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE(device_id, tag)
);

-- Streams
CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  endpoint_url TEXT NOT NULL DEFAULT '',
  protocol TEXT NOT NULL DEFAULT 'webrtc' CHECK(protocol IN ('webrtc','srt','rtmp','ndi')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','connecting','live','error','ended')),
  resolution TEXT DEFAULT '',
  fps INTEGER DEFAULT 0,
  bitrate INTEGER DEFAULT 0,
  codec TEXT DEFAULT 'H264',
  latency_ms INTEGER DEFAULT 0,
  packet_loss REAL DEFAULT 0,
  uptime_seconds INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Events (Production Events)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','live','completed','cancelled')),
  scheduled_start TIMESTAMP WITH TIME ZONE,
  scheduled_end TIMESTAMP WITH TIME ZONE,
  actual_start TIMESTAMP WITH TIME ZONE,
  actual_end TIMESTAMP WITH TIME ZONE,
  scene_preset TEXT DEFAULT '{}',
  layout_config TEXT DEFAULT '{}',
  production_template TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Camera Assignments (Event ↔ Device)
CREATE TABLE IF NOT EXISTS camera_assignments (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'camera' CHECK(role IN ('camera','ptz','wide','close','roaming','backup')),
  position_label TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  UNIQUE(event_id, device_id)
);

-- vMix Connections
CREATE TABLE IF NOT EXISTS vmix_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'vMix Instance',
  host TEXT NOT NULL DEFAULT '127.0.0.1',
  port INTEGER NOT NULL DEFAULT 8088,
  is_connected INTEGER NOT NULL DEFAULT 0,
  auto_reconnect INTEGER NOT NULL DEFAULT 1,
  last_connected TIMESTAMP WITH TIME ZONE,
  last_error TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Production Logs
CREATE TABLE IF NOT EXISTS production_logs (
  id SERIAL PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info','warning','error','vmix','device','stream','production')),
  source TEXT DEFAULT 'system',
  message TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Analytics Snapshots
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id SERIAL PRIMARY KEY,
  device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
  stream_id TEXT REFERENCES streams(id) ON DELETE CASCADE,
  bitrate INTEGER DEFAULT 0,
  fps INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  packet_loss REAL DEFAULT 0,
  battery_percent INTEGER DEFAULT -1,
  signal_quality INTEGER DEFAULT -1,
  resolution TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT 'general',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Layouts (saved production layouts)
CREATE TABLE IF NOT EXISTS layouts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ═══ Indexes ═══
CREATE INDEX IF NOT EXISTS idx_devices_online ON devices(is_online);
CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(group_name);
CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);
CREATE INDEX IF NOT EXISTS idx_streams_device ON streams(device_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_production_logs_created ON production_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_device ON analytics_snapshots(device_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_snapshots(created_at);

-- ═══ Default settings ═══
INSERT INTO settings (key, value, category) VALUES
  ('platform_name', 'Pixel Perfect', 'general'),
  ('org_name', 'Loyadham', 'general'),
  ('default_stream_protocol', 'webrtc', 'streaming'),
  ('default_resolution', '1920x1080', 'streaming'),
  ('default_fps', '30', 'streaming'),
  ('default_bitrate', '4000', 'streaming'),
  ('vmix_default_host', '127.0.0.1', 'vmix'),
  ('vmix_default_port', '8088', 'vmix'),
  ('analytics_retention_days', '30', 'analytics'),
  ('mediamtx_host', '', 'streaming'),
  ('mediamtx_port', '8554', 'streaming'),
  ('srt_ready', '0', 'streaming'),
  ('ndi_ready', '0', 'streaming'),
  ('bonding_ready', '0', 'network')
ON CONFLICT (key) DO NOTHING;
