import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, PanResponder, Animated, Vibration } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import * as Device from 'expo-device';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { COLORS, SHADOWS } from '../theme';
import connection from '../connection';
import { STREAM_DEFAULTS } from '../config';

const { width, height } = Dimensions.get('window');

// Zoom presets for quick-tap access
const ZOOM_PRESETS = [0.5, 1, 2, 3, 5];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 10;

const fmtZoom = (z) => `${z.toFixed(1)}x`;

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
  const [showStats, setShowStats] = useState(false);
  const [fps] = useState(STREAM_DEFAULTS.fps);
  const [bitrate] = useState(STREAM_DEFAULTS.bitrate);
  const [resolution] = useState(`${STREAM_DEFAULTS.resolution.width}x${STREAM_DEFAULTS.resolution.height}`);
  const [elapsed, setElapsed] = useState(0);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showZoomSlider, setShowZoomSlider] = useState(true);
  const cameraRef = useRef(null);
  const elapsedRef = useRef(null);
  const zoomSliderHeight = useRef(220);
  const zoomAnim = useRef(new Animated.Value(0)).current;

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const startZoomPctRef = useRef(0);

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

    // ═══ Listen for remote camera commands from Production dashboard ═══
    const handleCameraCmd = ({ cmd, payload }) => {
      switch (cmd) {
        case 'flip':
          setFacing(f => f === 'back' ? 'front' : 'back');
          Vibration.vibrate(50);
          break;
        case 'torch':
          setTorch(t => !t);
          Vibration.vibrate(50);
          break;
        case 'mute':
          setIsMuted(m => !m);
          Vibration.vibrate(50);
          break;
        case 'zoom':
          if (payload?.level !== undefined) {
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, payload.level));
            setZoom(newZoom);
          }
          break;
        default:
          console.warn('[Camera] Unknown cmd:', cmd);
      }
    };

    // Subscribe via connection manager event emitter
    connection.on('camera-cmd', handleCameraCmd);

    return () => {
      deactivateKeepAwake();
      connection.off('connected', onConnected);
      connection.off('disconnected', onDisconnected);
      connection.off('registered', onRegistered);
      connection.off('tally', onTally);
      connection.off('error', onError);
      connection.off('camera-cmd', handleCameraCmd);
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
        setSignal(ns.isConnected ? 85 : 0);
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
  const flipCamera = () => {
    setFacing(f => f === 'back' ? 'front' : 'back');
    Vibration.vibrate(30);
  };
  const toggleTorch = () => { setTorch(t => !t); };

  const fmtTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const tallyColor = tallyState === 'program' ? COLORS.red : tallyState === 'preview' ? COLORS.green : 'transparent';

  // ═══ Zoom Slider Pan Responder (Vertical) ═══
  const handleZoomChange = useCallback((newZoom) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    setZoom(clamped);
  }, []);

  const zoomPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const curZoom = zoomRef.current;
        startZoomPctRef.current = (curZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
      },
      onPanResponderMove: (_, gs) => {
        const sliderH = zoomSliderHeight.current || 220;
        // Moving UP (negative dy) increases zoom
        const deltaPct = -gs.dy / sliderH;
        const newPct = Math.max(0, Math.min(1, startZoomPctRef.current + deltaPct));
        const newZoom = MIN_ZOOM + newPct * (MAX_ZOOM - MIN_ZOOM);
        handleZoomChange(newZoom);
      },
    })
  ).current;

  // Calculate slider thumb position
  const zoomPct = (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);

  if (!permission) return <View style={st.container}><Text style={st.loadingText}>Loading…</Text></View>;
  if (!permission.granted) {
    return (
      <View style={[st.container, st.center]}>
        <View style={st.permCard}>
          <Text style={st.permIcon}>📹</Text>
          <Text style={st.permTitle}>Camera Permission</Text>
          <Text style={st.permDesc}>Pixel Perfect needs camera access for live streaming</Text>
          <TouchableOpacity style={st.permBtn} onPress={requestPermission} activeOpacity={0.7}>
            <Text style={st.permBtnText}>Grant Access</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={st.container}>
      {/* TALLY BORDER */}
      {tallyState !== 'off' && <View style={[st.tallyBorder, { borderColor: tallyColor }]} />}

      {/* CAMERA VIEWFINDER */}
      <CameraView ref={cameraRef} style={st.camera} facing={facing} enableTorch={torch} zoom={zoomPct}>

        {/* ═══ TOP STATUS BAR ═══ */}
        <View style={st.topBar}>
          {/* Tally Indicator */}
          {tallyState !== 'off' && (
            <View style={[st.tallyPill, { backgroundColor: tallyColor }]}>
              <Text style={st.tallyPillText}>
                {tallyState === 'program' ? '● PGM' : '● PVW'}
              </Text>
            </View>
          )}

          {/* Status Pills Row */}
          <View style={st.statusPillsRow}>
            {/* Connection */}
            <View style={st.statusPill}>
              <View style={[st.connDot, { backgroundColor: connected ? COLORS.green : COLORS.red }]} />
              <Text style={st.statusPillText} numberOfLines={1}>
                {deviceName || 'Not paired'}
              </Text>
            </View>

            {/* Recording */}
            {isStreaming && (
              <View style={st.recPill}>
                <View style={st.recDotAnim} />
                <Text style={st.recPillTime}>{fmtTime(elapsed)}</Text>
              </View>
            )}

            {/* Battery */}
            <View style={st.statusPill}>
              <Text style={[st.batteryIcon, battery < 20 && { color: COLORS.red }]}>
                {battery >= 80 ? '🔋' : battery >= 40 ? '🔋' : battery >= 20 ? '🪫' : '🪫'}
              </Text>
              <Text style={[st.statusPillText, st.mono, battery < 20 && { color: COLORS.red }]}>
                {battery >= 0 ? `${battery}%` : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* ═══ RIGHT SIDE: VERTICAL ZOOM SLIDER ═══ */}
        {showZoomSlider && (
          <View style={st.zoomContainer}>
            {/* Current zoom display */}
            <View style={st.zoomValueBadge}>
              <Text style={st.zoomValueText}>{fmtZoom(zoom)}</Text>
            </View>

            {/* Vertical slider track */}
            <View
              style={st.zoomTrack}
              {...zoomPanResponder.panHandlers}
              onLayout={(e) => { zoomSliderHeight.current = e.nativeEvent.layout.height; }}
            >
              {/* Track background */}
              <View style={st.zoomTrackBg}>
                {/* Filled portion */}
                <View style={[st.zoomTrackFill, { height: `${zoomPct * 100}%` }]} />
              </View>

              {/* Tick marks for presets */}
              {ZOOM_PRESETS.map((preset) => {
                const pct = (preset - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[st.zoomTick, { bottom: `${pct * 100}%` }]}
                    onPress={() => handleZoomChange(preset)}
                    activeOpacity={0.6}
                  >
                    <View style={[st.zoomTickLine, Math.abs(zoom - preset) < 0.3 && st.zoomTickLineActive]} />
                    <Text style={[st.zoomTickLabel, Math.abs(zoom - preset) < 0.3 && st.zoomTickLabelActive]}>
                      {preset < 1 ? `${preset}` : `${preset}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Draggable thumb */}
              <View style={[st.zoomThumb, { bottom: `${zoomPct * 100}%` }]}>
                <View style={st.zoomThumbInner} />
              </View>
            </View>

            {/* Min/Max labels */}
            <Text style={st.zoomMinLabel}>{fmtZoom(MIN_ZOOM)}</Text>
          </View>
        )}

        {/* ═══ STATS OVERLAY (compact, top-right, toggleable) ═══ */}
        {showStats && (
          <View style={st.statsPanel}>
            <View style={st.statRow}><Text style={st.statLabel}>RES</Text><Text style={st.statValue}>{resolution}</Text></View>
            <View style={st.statRow}><Text style={st.statLabel}>FPS</Text><Text style={st.statValue}>{fps}</Text></View>
            <View style={st.statRow}><Text style={st.statLabel}>BIT</Text><Text style={st.statValue}>{bitrate}k</Text></View>
            <View style={st.statRow}><Text style={st.statLabel}>NET</Text><Text style={st.statValue}>{networkType}</Text></View>
            <View style={st.statRow}><Text style={st.statLabel}>SIG</Text><Text style={[st.statValue, signal < 50 && { color: COLORS.red }]}>{signal >= 0 ? signal + '%' : '—'}</Text></View>
            <View style={st.statRow}><Text style={st.statLabel}>ZOOM</Text><Text style={st.statValue}>{fmtZoom(zoom)}</Text></View>
          </View>
        )}

        {/* ═══ BOTTOM CONTROLS ═══ */}
        <View style={st.bottomArea}>
          {/* Secondary controls row */}
          <View style={st.secondaryRow}>
            <TouchableOpacity style={st.secondaryBtn} onPress={() => setShowStats(!showStats)} activeOpacity={0.6}>
              <Text style={st.secondaryBtnIcon}>{showStats ? '📊' : '📊'}</Text>
              <Text style={[st.secondaryBtnLabel, showStats && { color: COLORS.accent }]}>
                {showStats ? 'Stats On' : 'Stats'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.secondaryBtn} onPress={() => setIsMuted(m => !m)} activeOpacity={0.6}>
              <Text style={st.secondaryBtnIcon}>{isMuted ? '🔇' : '🔊'}</Text>
              <Text style={[st.secondaryBtnLabel, isMuted && { color: COLORS.red }]}>
                {isMuted ? 'Muted' : 'Audio'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.secondaryBtn} onPress={() => setShowZoomSlider(z => !z)} activeOpacity={0.6}>
              <Text style={st.secondaryBtnIcon}>🔍</Text>
              <Text style={[st.secondaryBtnLabel, showZoomSlider && { color: COLORS.accent }]}>Zoom</Text>
            </TouchableOpacity>
          </View>

          {/* Primary controls row */}
          <View style={st.primaryRow}>
            {/* Settings */}
            <TouchableOpacity style={st.circleBtn} onPress={() => navigation.navigate('Settings')} activeOpacity={0.7}>
              <Text style={st.circleBtnIcon}>⚙️</Text>
            </TouchableOpacity>

            {/* Flip Camera */}
            <TouchableOpacity style={st.circleBtn} onPress={flipCamera} activeOpacity={0.7}>
              <Text style={st.circleBtnIcon}>🔄</Text>
            </TouchableOpacity>

            {/* MAIN STREAM BUTTON */}
            <TouchableOpacity
              style={[st.streamBtn, isStreaming && st.streamBtnActive]}
              onPress={toggleStream}
              activeOpacity={0.7}
            >
              <View style={[st.streamBtnRing, isStreaming && st.streamBtnRingActive]}>
                {isStreaming ? (
                  <View style={st.stopSquare} />
                ) : (
                  <View style={st.startCircle} />
                )}
              </View>
            </TouchableOpacity>

            {/* Torch */}
            <TouchableOpacity
              style={[st.circleBtn, torch && st.circleBtnActive]}
              onPress={toggleTorch}
              activeOpacity={0.7}
            >
              <Text style={st.circleBtnIcon}>{torch ? '🔦' : '💡'}</Text>
            </TouchableOpacity>

            {/* Quick Zoom Toggle (1x / 0.5x) */}
            <TouchableOpacity
              style={st.zoomQuickBtn}
              onPress={() => handleZoomChange(zoom <= 0.9 ? 1 : 0.5)}
              activeOpacity={0.7}
            >
              <Text style={st.zoomQuickText}>{fmtZoom(zoom <= 0.9 ? 1 : 0.5)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { color: COLORS.text, fontSize: 16 },
  camera: { flex: 1 },

  // ─── Permission Screen ───
  permCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '85%',
    ...SHADOWS.card,
  },
  permIcon: { fontSize: 48, marginBottom: 16 },
  permTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  permDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  permBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    ...SHADOWS.glow(COLORS.accent),
  },
  permBtnText: { fontWeight: '700', color: COLORS.bg, fontSize: 16 },

  // ─── Tally ───
  tallyBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 4, zIndex: 100, pointerEvents: 'none' },
  tallyPill: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 4,
  },
  tallyPillText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1 },

  // ─── Top Status Bar ───
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 48,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  statusPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statusPillText: { fontSize: 11, fontWeight: '700', color: COLORS.text, maxWidth: 120 },
  connDot: { width: 7, height: 7, borderRadius: 4 },
  batteryIcon: { fontSize: 12 },
  mono: { fontFamily: 'monospace', fontSize: 10 },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.red,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  recDotAnim: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  recPillTime: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'monospace' },

  // ─── Vertical Zoom Slider (Right Side) ───
  zoomContainer: {
    position: 'absolute',
    right: 16,
    top: '20%',
    bottom: '30%',
    alignItems: 'center',
    zIndex: 15,
    width: 56,
  },
  zoomValueBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
  },
  zoomValueText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  zoomTrack: {
    flex: 1,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  zoomTrackBg: {
    width: 4,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'absolute',
  },
  zoomTrackFill: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: COLORS.accent + '80',
    borderRadius: 2,
  },
  zoomTick: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    transform: [{ translateY: 2 }],
  },
  zoomTickLine: {
    width: 8,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
  },
  zoomTickLineActive: { backgroundColor: COLORS.accent, width: 12 },
  zoomTickLabel: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    minWidth: 14,
  },
  zoomTickLabelActive: { color: COLORS.accent, fontWeight: '800' },
  zoomThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 2,
    borderColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateY: 12 }],
    left: 10,
  },
  zoomThumbInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  zoomMinLabel: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.3)',
    marginTop: 6,
  },

  // ─── Stats Panel (toggleable, left side) ───
  statsPanel: {
    position: 'absolute',
    top: 110,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    padding: 10,
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  statLabel: { width: 36, fontSize: 9, fontWeight: '800', color: COLORS.textMuted, fontFamily: 'monospace', letterSpacing: 0.5 },
  statValue: { fontSize: 11, color: COLORS.accent, fontFamily: 'monospace', fontWeight: '700' },

  // ─── Bottom Controls ───
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },

  // Secondary row (stats, mute, zoom toggle)
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 12,
  },
  secondaryBtn: { alignItems: 'center', gap: 2 },
  secondaryBtnIcon: { fontSize: 18 },
  secondaryBtnLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600' },

  // Primary row (settings, flip, record, torch, zoom quick)
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },

  circleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  circleBtnActive: {
    backgroundColor: COLORS.accent + '25',
    borderColor: COLORS.accent + '60',
  },
  circleBtnIcon: { fontSize: 22 },

  // Stream button
  streamBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  streamBtnActive: {},
  streamBtnRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  streamBtnRingActive: {
    borderColor: COLORS.red,
    backgroundColor: 'rgba(255,61,113,0.12)',
    ...SHADOWS.glow(COLORS.red),
  },
  startCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.red },
  stopSquare: { width: 22, height: 22, borderRadius: 4, backgroundColor: COLORS.red },

  // Zoom quick toggle button
  zoomQuickBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,212,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  zoomQuickText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accent,
    fontFamily: 'monospace',
  },
});
