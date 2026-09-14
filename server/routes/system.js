const express = require('express');
const os = require('os');
const router = express.Router();

// Track CPU usage over time
let prevCpuUsage = null;

function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  cpus.forEach(cpu => {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  });
  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;

  if (prevCpuUsage) {
    const idleDiff = idle - prevCpuUsage.idle;
    const totalDiff = total - prevCpuUsage.total;
    prevCpuUsage = { idle, total };
    return Math.round((1 - idleDiff / totalDiff) * 100);
  }
  prevCpuUsage = { idle, total };
  return 0;
}

// Warm up CPU measurement
getCpuUsage();

// ═══ System Health ═══
router.get('/health', (_req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpuPercent = getCpuUsage();
  const uptime = process.uptime();
  const serverUptime = os.uptime();

  const networkInterfaces = os.networkInterfaces();
  const activeNics = [];
  for (const [name, addrs] of Object.entries(networkInterfaces)) {
    const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
    if (ipv4) activeNics.push({ name, ip: ipv4.address, mac: ipv4.mac });
  }

  res.json({
    cpu: {
      percent: cpuPercent,
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'Unknown',
      speed: os.cpus()[0]?.speed || 0,
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: Math.round((usedMem / totalMem) * 100),
    },
    disk: {
      // Note: Real disk usage requires child_process; approximated here
      note: 'Use /api/system/disk for detailed disk info',
    },
    network: {
      interfaces: activeNics,
      hostname: os.hostname(),
    },
    uptime: {
      process: Math.floor(uptime),
      system: Math.floor(serverUptime),
      processFormatted: formatUptime(uptime),
      systemFormatted: formatUptime(serverUptime),
    },
    platform: {
      os: os.platform(),
      arch: os.arch(),
      release: os.release(),
      nodeVersion: process.version,
    },
    timestamp: new Date().toISOString(),
  });
});

// ═══ Detailed Disk Usage (Windows) ═══
router.get('/disk', async (_req, res) => {
  try {
    const { execSync } = require('child_process');
    const isWindows = os.platform() === 'win32';
    let disks = [];

    if (isWindows) {
      const output = execSync('wmic logicaldisk get size,freespace,caption /format:csv', { encoding: 'utf8' });
      const lines = output.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));
      disks = lines.map(line => {
        const parts = line.trim().split(',');
        if (parts.length >= 4) {
          const caption = parts[1];
          const free = parseInt(parts[2]) || 0;
          const total = parseInt(parts[3]) || 0;
          const used = total - free;
          return { drive: caption, total, used, free, percent: total > 0 ? Math.round((used / total) * 100) : 0 };
        }
        return null;
      }).filter(Boolean);
    } else {
      const output = execSync("df -B1 --output=source,size,used,avail,pcent,target | grep '^/'", { encoding: 'utf8' });
      disks = output.trim().split('\n').map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          drive: parts[5] || parts[0],
          total: parseInt(parts[1]) || 0,
          used: parseInt(parts[2]) || 0,
          free: parseInt(parts[3]) || 0,
          percent: parseInt(parts[4]) || 0,
        };
      });
    }
    res.json({ disks });
  } catch (err) {
    res.json({ disks: [], error: err.message });
  }
});

// ═══ Signal Flow Topology ═══
router.get('/topology', async (req, res) => {
  // Returns the current signal flow: sources → switcher → outputs
  const helpers = req.app.get('dbHelpers');
  let devices = [], switchers = [], vmixConns = [], atemConns = [];

  try {
    if (helpers?.getDevices) devices = await helpers.getDevices();
    if (helpers?.getSwitcherConnections) switchers = await helpers.getSwitcherConnections();
    if (helpers?.getVmixConnections) vmixConns = await helpers.getVmixConnections();
    if (helpers?.getAtemConnections) atemConns = await helpers.getAtemConnections();
  } catch (e) { /* offline mode */ }

  const nodes = [];
  const edges = [];

  // Camera sources
  (devices || []).forEach(d => {
    nodes.push({ id: `cam-${d.id}`, type: 'source', label: d.name || d.label, icon: '📹', status: d.is_online ? 'online' : 'offline' });
  });

  // Switchers
  (vmixConns || []).forEach(v => {
    nodes.push({ id: `vmix-${v.id}`, type: 'switcher', label: v.name, icon: '🎛️', brand: 'vMix', status: v.is_connected ? 'connected' : 'disconnected' });
  });
  (atemConns || []).forEach(a => {
    nodes.push({ id: `atem-${a.id}`, type: 'switcher', label: a.name, icon: '🎚️', brand: 'ATEM', status: a.is_connected ? 'connected' : 'disconnected' });
  });
  (switchers || []).forEach(s => {
    nodes.push({ id: `sw-${s.id}`, type: 'switcher', label: s.name, icon: '🔀', brand: s.manufacturer, status: s.is_connected ? 'connected' : 'disconnected' });
  });

  // Output node
  nodes.push({ id: 'output-pgm', type: 'output', label: 'Program Output', icon: '📺', status: 'active' });
  nodes.push({ id: 'output-stream', type: 'output', label: 'Stream/CDN', icon: '📡', status: 'active' });

  res.json({ nodes, edges });
});

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

module.exports = router;
