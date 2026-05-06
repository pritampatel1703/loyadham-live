import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, AppState } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import * as Device from 'expo-device';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { COLORS, SHADOWS } from '../theme';
import connection from '../connection';
import { STREAM_DEFAULTS } from '../config';

const { width, height } = Dimensions.get('window');

export default function CameraScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [isStreaming, setIsStreaming] = useState(false);
  const [tallyState, setTallyState] = useState('off'); // off | preview | program
  const [battery, setBattery] = useState(-1);
  const [signal, setSignal] = useState(-1);
  const [networkType, setNetworkType] = useState('');
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [showStats, setShowStats] = useState(true);
  const [fps] = useState(STREAM_DEFAULTS.fps);
  const [bitrate] = useState(STREAM_DEFAULTS.bitrate);
  const [resolution] = useState(`${STREAM_DEFAULTS.resolution.width}x${STREAM_DEFAULTS.resolution.height}`);
  const [elapsed, setElapsed] = useState(0);
  const [torch, setTorch] = useState(false);
  const cameraRef = useRef(null);
  const elapsedRef = useRef(null);

  // ═══ Connection Events ═══
  useEffect(() => {
    activateKeepAwakeAsync();

    const onConnected = () => setConnected(true);
    const onDisconnected = () => setConnected(false);
    const onRegistered = (d) => setDeviceName(d.device_name);
    const onTally = (d) => setTallyState(d.state || 'off');
    const onError = (d) => console.warn('[Camera]', d.message);

    connection.on('connected', onConnected);
    connection.on('disconnected', onDisconnected);
    connection.on('registered', onRegistered);
    connection.on('tally', onTally);
    connection.on('error', onError);

    setConnected(connection.isConnected);
    setDeviceName(connection.deviceName || '');

    return () => {
      deactivateKeepAwake();
      connection.off('connected', onConnected);
      connection.off('disconnected', onDisconnected);
      connection.off('registered', onRegistered);
      connection.off('tally', onTally);
      connection.off('error', onError);
    };
  }, []);

  // ═══ Battery & Network Monitoring ═══
  useEffect(() => {
    const updateStats = async () => {
      try {
        const bl = await Battery.getBatteryLevelAsync();
        setBattery(Math.round(bl * 100));
        const ns = await Network.getNetworkStateAsync();
        setNetworkType(ns.type || 'Unknown');
        setSignal(ns.isConnected ? 85 : 0); // Expo doesn't provide exact signal strength
      } catch (e) { /* ignore */ }
    };
    updateStats();
    const id = setInterval(updateStats, 5000);
    return () => clearInterval(id);
  }, []);

  // ═══ Heartbeat Provider ═══
  useEffect(() => {
    connection.setHeartbeatProvider(() => ({
      battery, signal, temperature: -1,
      resolution, fps, bitrate,
      network_type: networkType,
      ip_address: '',
      device_model: Device.modelName || 'Unknown',
      os_version: `Android ${Device.osVersion || ''}`,
    }));
  }, [battery, signal, networkType, resolution, fps, bitrate]);

  // ═══ Stream Timer ═══
  useEffect(() => {
    if (isStreaming) {
      elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(elapsedRef.current);
      setElapsed(0);
    }
    return () => clearInterval(elapsedRef.current);
  }, [isStreaming]);

  const toggleStream = () => { setIsStreaming(!isStreaming); };
  const flipCamera = () => { setFacing(f => f === 'back' ? 'front' : 'back'); };
  const toggleTorch = () => { setTorch(t => !t); };

  const fmtTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const tallyColor = tallyState === 'program' ? COLORS.red : tallyState === 'preview' ? COLORS.green : 'transparent';

  if (!permission) return <View style={s.container}><Text style={s.loadingText}>Loading…</Text></View>;
  if (!permission.granted) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.permTitle}>📹 Camera Permission Required</Text>
        <Text style={s.permDesc}>Pixel Perfect needs camera access for live streaming</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}><Text style={s.permBtnText}>Grant Permission</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* TALLY BORDER */}
      {tallyState !== 'off' && <View style={[s.tallyBorder, { borderColor: tallyColor }]} />}

      {/* CAMERA VIEWFINDER */}
      <CameraView ref={cameraRef} style={s.camera} facing={facing} enableTorch={torch}>

        {/* TOP OVERLAY */}
        <View style={s.topOverlay}>
          {/* Tally Bar */}
          {tallyState !== 'off' && (
            <View style={[s.tallyBar, { backgroundColor: tallyColor }]}>
              <Text style={s.tallyText}>{tallyState === 'program' ? '● ON AIR — PROGRAM' : '● PREVIEW'}</Text>
            </View>
          )}

          {/* Status Row */}
          <View style={s.statusRow}>
            {/* Left: Connection + Name */}
            <View style={s.statusLeft}>
              <View style={[s.connDot, { backgroundColor: connected ? COLORS.green : COLORS.red }]} />
              <Text style={s.deviceNameText} numberOfLines={1}>{deviceName || 'Not paired'}</Text>
            </View>
            {/* Center: Recording indicator */}
            {isStreaming && (
              <View style={s.recBadge}>
                <View style={s.recDot} />
                <Text style={s.recTime}>{fmtTime(elapsed)}</Text>
              </View>
            )}
            {/* Right: Battery */}
            <View style={s.statusRight}>
              <Text style={[s.batteryText, battery < 20 && { color: COLORS.red }]}>🔋{battery >= 0 ? battery + '%' : '—'}</Text>
            </View>
          </View>
        </View>

        {/* STATS OVERLAY (bottom-left) */}
        {showStats && (
          <View style={s.statsPanel}>
            <View style={s.statRow}><Text style={s.statLabel}>RES</Text><Text style={s.statValue}>{resolution}</Text></View>
            <View style={s.statRow}><Text style={s.statLabel}>FPS</Text><Text style={s.statValue}>{fps}</Text></View>
            <View style={s.statRow}><Text style={s.statLabel}>BIT</Text><Text style={s.statValue}>{bitrate}k</Text></View>
            <View style={s.statRow}><Text style={s.statLabel}>NET</Text><Text style={s.statValue}>{networkType}</Text></View>
            <View style={s.statRow}><Text style={s.statLabel}>SIG</Text><Text style={[s.statValue, signal < 50 && { color: COLORS.red }]}>{signal >= 0 ? signal + '%' : '—'}</Text></View>
          </View>
        )}

        {/* BOTTOM CONTROLS */}
        <View style={s.bottomBar}>
          <View style={s.controlRow}>
            {/* Settings */}
            <TouchableOpacity style={s.sideBtn} onPress={() => navigation.navigate('Settings')}>
              <Text style={s.sideBtnIcon}>⚙️</Text>
              <Text style={s.sideBtnLabel}>Settings</Text>
            </TouchableOpacity>

            {/* Flip Camera */}
            <TouchableOpacity style={s.sideBtn} onPress={flipCamera}>
              <Text style={s.sideBtnIcon}>🔄</Text>
              <Text style={s.sideBtnLabel}>Flip</Text>
            </TouchableOpacity>

            {/* MAIN STREAM BUTTON */}
            <TouchableOpacity style={[s.streamBtn, isStreaming && s.streamBtnActive]} onPress={toggleStream} activeOpacity={0.7}>
              <View style={[s.streamBtnInner, isStreaming && s.streamBtnInnerActive]}>
                {isStreaming ? <View style={s.stopSquare} /> : <View style={s.startCircle} />}
              </View>
            </TouchableOpacity>

            {/* Torch */}
            <TouchableOpacity style={s.sideBtn} onPress={toggleTorch}>
              <Text style={s.sideBtnIcon}>{torch ? '🔦' : '💡'}</Text>
              <Text style={s.sideBtnLabel}>{torch ? 'Torch On' : 'Torch'}</Text>
            </TouchableOpacity>

            {/* Stats Toggle */}
            <TouchableOpacity style={s.sideBtn} onPress={() => setShowStats(!showStats)}>
              <Text style={s.sideBtnIcon}>📊</Text>
              <Text style={s.sideBtnLabel}>{showStats ? 'Hide' : 'Stats'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { color: COLORS.text, fontSize: 16 },
  camera: { flex: 1 },

  // Tally
  tallyBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 4, zIndex: 100, pointerEvents: 'none' },
  tallyBar: { paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  tallyText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1 },

  // Top Overlay
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, paddingTop: 48, backgroundColor: 'rgba(0,0,0,0.5)' },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  deviceNameText: { fontSize: 13, fontWeight: '700', color: COLORS.text, maxWidth: 150 },
  statusRight: { flexDirection: 'row', alignItems: 'center' },
  batteryText: { fontSize: 12, color: COLORS.green, fontFamily: 'monospace', fontWeight: '700' },
  recBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.red, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  recTime: { color: '#fff', fontSize: 13, fontWeight: '800', fontFamily: 'monospace' },

  // Stats Panel
  statsPanel: { position: 'absolute', bottom: 110, left: 12, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: 10, zIndex: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  statLabel: { width: 32, fontSize: 10, fontWeight: '800', color: COLORS.textMuted, fontFamily: 'monospace' },
  statValue: { fontSize: 12, color: COLORS.accent, fontFamily: 'monospace', fontWeight: '700' },

  // Bottom Controls
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 24, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10 },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 12 },
  sideBtn: { alignItems: 'center', width: 56, gap: 4 },
  sideBtnIcon: { fontSize: 24 },
  sideBtnLabel: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },

  // Stream Button
  streamBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: COLORS.text, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  streamBtnActive: { borderColor: COLORS.red, ...SHADOWS.glow(COLORS.red) },
  streamBtnInner: { width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  streamBtnInnerActive: { backgroundColor: 'rgba(255,61,113,0.2)' },
  startCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.red },
  stopSquare: { width: 20, height: 20, borderRadius: 4, backgroundColor: COLORS.red },

  // Permission
  permTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  permDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
  permBtn: { backgroundColor: COLORS.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  permBtnText: { fontWeight: '700', color: COLORS.bg, fontSize: 15 },
});
