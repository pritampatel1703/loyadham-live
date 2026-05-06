import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Switch } from 'react-native';
import { COLORS } from '../theme';
import { STREAM_DEFAULTS, APP_VERSION } from '../config';
import connection from '../connection';

export default function SettingsScreen({ navigation }) {
  const [resolution, setResolution] = useState(`${STREAM_DEFAULTS.resolution.width}x${STREAM_DEFAULTS.resolution.height}`);
  const [fps, setFps] = useState(String(STREAM_DEFAULTS.fps));
  const [bitrate, setBitrate] = useState(String(STREAM_DEFAULTS.bitrate));
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);

  const unpair = () => {
    Alert.alert('Unpair Device', 'This will disconnect from the server. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unpair', style: 'destructive', onPress: () => { connection.destroy(); navigation.replace('Pair'); } },
    ]);
  };

  return (
    <View style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Connection Info */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🔗 Connection</Text>
          <View style={s.infoCard}>
            <View style={s.infoRow}><Text style={s.infoLabel}>Device</Text><Text style={s.infoValue}>{connection.deviceName || '—'}</Text></View>
            <View style={s.infoRow}><Text style={s.infoLabel}>Device ID</Text><Text style={[s.infoValue, s.mono]}>{connection.deviceId?.slice(0, 12) || '—'}…</Text></View>
            <View style={s.infoRow}><Text style={s.infoLabel}>Server</Text><Text style={[s.infoValue, s.mono]}>{connection.serverUrl}</Text></View>
            <View style={s.infoRow}><Text style={s.infoLabel}>Status</Text><Text style={[s.infoValue, { color: connection.isConnected ? COLORS.green : COLORS.red }]}>{connection.isConnected ? '● Connected' : '● Disconnected'}</Text></View>
          </View>
        </View>

        {/* Stream Settings */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📹 Stream</Text>
          <View style={s.infoCard}>
            <View style={s.settingRow}>
              <Text style={s.settingLabel}>Resolution</Text>
              <View style={s.resRow}>
                {['1280x720', '1920x1080', '3840x2160'].map(r => (
                  <TouchableOpacity key={r} style={[s.resBtn, resolution === r && s.resBtnActive]} onPress={() => setResolution(r)}>
                    <Text style={[s.resBtnText, resolution === r && s.resBtnTextActive]}>{r === '1280x720' ? '720p' : r === '1920x1080' ? '1080p' : '4K'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.settingRow}>
              <Text style={s.settingLabel}>FPS</Text>
              <View style={s.resRow}>
                {['24', '25', '30', '60'].map(f => (
                  <TouchableOpacity key={f} style={[s.resBtn, fps === f && s.resBtnActive]} onPress={() => setFps(f)}>
                    <Text style={[s.resBtnText, fps === f && s.resBtnTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.settingRow}>
              <Text style={s.settingLabel}>Bitrate (kbps)</Text>
              <TextInput style={s.input} value={bitrate} onChangeText={setBitrate} keyboardType="numeric" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>
        </View>

        {/* Preferences */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>⚙️ Preferences</Text>
          <View style={s.infoCard}>
            <View style={s.switchRow}>
              <Text style={s.settingLabel}>Auto-Reconnect</Text>
              <Switch value={autoReconnect} onValueChange={setAutoReconnect} trackColor={{ false: COLORS.border, true: COLORS.accent + '50' }} thumbColor={autoReconnect ? COLORS.accent : COLORS.textMuted} />
            </View>
            <View style={s.switchRow}>
              <Text style={s.settingLabel}>Show Stats Overlay</Text>
              <Switch value={showOverlay} onValueChange={setShowOverlay} trackColor={{ false: COLORS.border, true: COLORS.accent + '50' }} thumbColor={showOverlay ? COLORS.accent : COLORS.textMuted} />
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={s.section}>
          <TouchableOpacity style={s.dangerBtn} onPress={unpair} activeOpacity={0.7}>
            <Text style={s.dangerBtnText}>🔌 Unpair & Disconnect</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <View style={s.aboutBox}>
          <Text style={s.aboutTitle}>⚡ Pixel Perfect Camera</Text>
          <Text style={s.aboutSub}>Version {APP_VERSION}</Text>
          <Text style={s.aboutSub}>Loyadham Broadcast Operations</Text>
          <Text style={[s.aboutSub, { marginTop: 8 }]}>Professional wireless broadcast camera for multi-camera production workflows.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { color: COLORS.accent, fontSize: 16, fontWeight: '600' },
  topTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  scrollContent: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  infoCard: { backgroundColor: COLORS.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border + '50' },
  infoLabel: { fontSize: 13, color: COLORS.textMuted },
  infoValue: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  mono: { fontFamily: 'monospace', fontSize: 11 },

  settingRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border + '50' },
  settingLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600', marginBottom: 8 },
  resRow: { flexDirection: 'row', gap: 8 },
  resBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgSecondary },
  resBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '15' },
  resBtnText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '700', fontFamily: 'monospace' },
  resBtnTextActive: { color: COLORS.accent },
  input: { backgroundColor: COLORS.bgSecondary, borderRadius: 8, padding: 10, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, fontFamily: 'monospace' },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border + '50' },

  dangerBtn: { backgroundColor: COLORS.red + '15', borderWidth: 1, borderColor: COLORS.red + '40', borderRadius: 12, padding: 16, alignItems: 'center' },
  dangerBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.red },

  aboutBox: { alignItems: 'center', paddingVertical: 24, marginTop: 8 },
  aboutTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  aboutSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, textAlign: 'center', lineHeight: 18 },
});
