import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Vibration, Dimensions, ScrollView } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { COLORS, SHADOWS } from '../theme';
import { SERVER_URL, APP_VERSION } from '../config';
import connection from '../connection';

const { width } = Dimensions.get('window');

export default function PairScreen({ navigation }) {
  const [mode, setMode] = useState('menu'); // menu | scan | manual
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [manualUrl, setManualUrl] = useState(SERVER_URL);
  const [manualToken, setManualToken] = useState('');
  const [pairing, setPairing] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleQRScan = async ({ type, data }) => {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(100);
    setPairing(true);
    setStatus('Pairing…');
    try {
      await connection.pair(data);
      setStatus('✅ Paired! Connecting…');
      connection.connect();
      setTimeout(() => navigation.replace('Camera'), 1000);
    } catch (err) {
      setStatus('❌ ' + err.message);
      setScanned(false);
      setPairing(false);
    }
  };

  const handleManualPair = async () => {
    if (!manualToken.trim()) { Alert.alert('Error', 'Enter pairing token'); return; }
    setPairing(true);
    setStatus('Pairing…');
    try {
      connection.setServerUrl(manualUrl);
      await connection.pair({ server: manualUrl, token: manualToken.trim() });
      setStatus('✅ Paired!');
      connection.connect();
      setTimeout(() => navigation.replace('Camera'), 1000);
    } catch (err) {
      setStatus('❌ ' + err.message);
      setPairing(false);
    }
  };

  // ═══ MENU SCREEN ═══
  if (mode === 'menu') {
    return (
      <View style={s.container}>
        <View style={s.brandArea}>
          <Text style={s.brandIcon}>⚡</Text>
          <Text style={s.brandName}>Pixel Perfect</Text>
          <Text style={s.brandSub}>Broadcast Camera</Text>
          <View style={s.versionBadge}><Text style={s.versionText}>v{APP_VERSION}</Text></View>
        </View>

        <View style={s.menuCards}>
          <TouchableOpacity style={[s.menuCard, s.menuCardPrimary]} onPress={() => setMode('scan')} activeOpacity={0.7}>
            <Text style={s.menuCardIcon}>📱</Text>
            <Text style={s.menuCardTitle}>Scan QR Code</Text>
            <Text style={s.menuCardDesc}>Scan the pairing code shown on the Pixel Perfect dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.menuCard} onPress={() => setMode('manual')} activeOpacity={0.7}>
            <Text style={s.menuCardIcon}>⌨️</Text>
            <Text style={s.menuCardTitle}>Manual Pairing</Text>
            <Text style={s.menuCardDesc}>Enter server URL and pairing token manually</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>Loyadham Broadcast Operations</Text>
      </View>
    );
  }

  // ═══ QR SCANNER ═══
  if (mode === 'scan') {
    return (
      <View style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => { setMode('menu'); setScanned(false); }}>
            <Text style={s.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Scan QR Code</Text>
          <View style={{ width: 50 }} />
        </View>

        {hasPermission === false ? (
          <View style={s.center}><Text style={s.errorText}>Camera permission denied</Text></View>
        ) : (
          <View style={s.scannerWrap}>
            <BarCodeScanner onBarCodeScanned={scanned ? undefined : handleQRScan} style={s.scanner} />
            <View style={s.scanOverlay}>
              <View style={s.scanCornerTL} /><View style={s.scanCornerTR} /><View style={s.scanCornerBL} /><View style={s.scanCornerBR} />
            </View>
          </View>
        )}

        {status ? <Text style={s.statusText}>{status}</Text> : (
          <Text style={s.hintText}>Point camera at the QR code in the Dashboard → Devices → QR Pair</Text>
        )}

        {scanned && !pairing && (
          <TouchableOpacity style={s.retryBtn} onPress={() => setScanned(false)}>
            <Text style={s.retryText}>🔄 Tap to Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ═══ MANUAL PAIRING ═══
  return (
    <ScrollView style={s.container} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => setMode('menu')}>
          <Text style={s.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>Manual Pairing</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={s.formArea}>
        <Text style={s.formLabel}>Server URL</Text>
        <TextInput style={s.input} value={manualUrl} onChangeText={setManualUrl} placeholder="http://192.168.1.x:3001" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />

        <Text style={s.formLabel}>Pairing Token</Text>
        <TextInput style={s.input} value={manualToken} onChangeText={setManualToken} placeholder="e.g. A1B2C3D4E5F6" placeholderTextColor={COLORS.textMuted} autoCapitalize="characters" autoCorrect={false} />

        {status ? <Text style={s.statusText}>{status}</Text> : null}

        <TouchableOpacity style={[s.pairBtn, pairing && s.pairBtnDisabled]} onPress={handleManualPair} disabled={pairing} activeOpacity={0.7}>
          <Text style={s.pairBtnText}>{pairing ? '⏳ Pairing…' : '🔗 Connect'}</Text>
        </TouchableOpacity>

        <View style={s.helpBox}>
          <Text style={s.helpTitle}>How to find your token:</Text>
          <Text style={s.helpStep}>1. Open Pixel Perfect Dashboard</Text>
          <Text style={s.helpStep}>2. Go to Devices → Add Device</Text>
          <Text style={s.helpStep}>3. Click "QR Pair" on any device</Text>
          <Text style={s.helpStep}>4. Copy the token shown below the QR code</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Brand
  brandArea: { alignItems: 'center', paddingTop: 80, paddingBottom: 40 },
  brandIcon: { fontSize: 56, marginBottom: 8 },
  brandName: { fontSize: 32, fontWeight: '900', color: COLORS.text, letterSpacing: 1 },
  brandSub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  versionBadge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12, backgroundColor: COLORS.accent + '20', borderWidth: 1, borderColor: COLORS.accent + '40' },
  versionText: { fontSize: 11, color: COLORS.accent, fontFamily: 'monospace' },

  // Menu Cards
  menuCards: { paddingHorizontal: 24, gap: 16 },
  menuCard: { backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.card },
  menuCardPrimary: { borderColor: COLORS.accent + '60', backgroundColor: COLORS.accent + '08' },
  menuCardIcon: { fontSize: 36, marginBottom: 8 },
  menuCardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  menuCardDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },

  // Top Bar
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  backBtn: { color: COLORS.accent, fontSize: 16, fontWeight: '600' },
  topTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },

  // Scanner
  scannerWrap: { width: width - 48, height: width - 48, alignSelf: 'center', borderRadius: 20, overflow: 'hidden', marginVertical: 20, position: 'relative' },
  scanner: { flex: 1 },
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scanCornerTL: { position: 'absolute', top: 20, left: 20, width: 40, height: 40, borderTopWidth: 3, borderLeftWidth: 3, borderColor: COLORS.accent },
  scanCornerTR: { position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderTopWidth: 3, borderRightWidth: 3, borderColor: COLORS.accent },
  scanCornerBL: { position: 'absolute', bottom: 20, left: 20, width: 40, height: 40, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: COLORS.accent },
  scanCornerBR: { position: 'absolute', bottom: 20, right: 20, width: 40, height: 40, borderBottomWidth: 3, borderRightWidth: 3, borderColor: COLORS.accent },

  // Status
  statusText: { textAlign: 'center', fontSize: 15, color: COLORS.accent, marginVertical: 12, fontWeight: '600' },
  hintText: { textAlign: 'center', fontSize: 13, color: COLORS.textMuted, paddingHorizontal: 40, lineHeight: 18 },
  errorText: { fontSize: 16, color: COLORS.red },
  retryBtn: { alignSelf: 'center', marginTop: 16, padding: 12, backgroundColor: COLORS.bgCard, borderRadius: 10, borderWidth: 1, borderColor: COLORS.accent + '40' },
  retryText: { color: COLORS.accent, fontWeight: '600' },

  // Manual Form
  formArea: { padding: 24, flex: 1 },
  formLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: COLORS.bgSecondary, borderRadius: 10, padding: 14, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  pairBtn: { marginTop: 24, backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center', ...SHADOWS.glow(COLORS.accent) },
  pairBtnDisabled: { opacity: 0.6 },
  pairBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.bg },

  // Help
  helpBox: { marginTop: 32, padding: 16, backgroundColor: COLORS.bgCard, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  helpTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  helpStep: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4, paddingLeft: 4, lineHeight: 18 },

  footer: { textAlign: 'center', color: COLORS.textMuted, fontSize: 11, position: 'absolute', bottom: 24, alignSelf: 'center' },
});
