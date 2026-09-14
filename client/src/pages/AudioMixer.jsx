import { useState, useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════
   AUDIO MIXER — Professional Broadcast Audio Console
   ═══════════════════════════════════════════════════════════ */

const DEFAULT_CHANNELS = [
  { id: 1, name: 'CAM 1', type: 'camera', level: 75, pan: 0, muted: false, solo: false, afv: false, eq: { low: 0, mid: 0, high: 0 }, compressor: { threshold: -20, ratio: 4, attack: 10, release: 100, enabled: false }, bus: ['pgm'] },
  { id: 2, name: 'CAM 2', type: 'camera', level: 75, pan: 0, muted: false, solo: false, afv: false, eq: { low: 0, mid: 0, high: 0 }, compressor: { threshold: -20, ratio: 4, attack: 10, release: 100, enabled: false }, bus: ['pgm'] },
  { id: 3, name: 'CAM 3', type: 'camera', level: 75, pan: 0, muted: false, solo: false, afv: true, eq: { low: 0, mid: 0, high: 0 }, compressor: { threshold: -20, ratio: 4, attack: 10, release: 100, enabled: false }, bus: ['pgm'] },
  { id: 4, name: 'CAM 4', type: 'camera', level: 75, pan: 0, muted: false, solo: false, afv: true, eq: { low: 0, mid: 0, high: 0 }, compressor: { threshold: -20, ratio: 4, attack: 10, release: 100, enabled: false }, bus: ['pgm'] },
  { id: 5, name: 'MIC 1', type: 'mic', level: 80, pan: 0, muted: false, solo: false, afv: false, eq: { low: 2, mid: 0, high: 1 }, compressor: { threshold: -15, ratio: 3, attack: 5, release: 80, enabled: true }, bus: ['pgm', 'mon'] },
  { id: 6, name: 'MIC 2', type: 'mic', level: 80, pan: 0, muted: false, solo: false, afv: false, eq: { low: 2, mid: 0, high: 1 }, compressor: { threshold: -15, ratio: 3, attack: 5, release: 80, enabled: true }, bus: ['pgm', 'mon'] },
  { id: 7, name: 'MUSIC', type: 'aux', level: 40, pan: 0, muted: false, solo: false, afv: false, eq: { low: 0, mid: 0, high: 0 }, compressor: { threshold: -20, ratio: 2, attack: 20, release: 200, enabled: false }, bus: ['pgm'] },
  { id: 8, name: 'SFX', type: 'aux', level: 60, pan: 0, muted: true, solo: false, afv: false, eq: { low: 0, mid: 0, high: 0 }, compressor: { threshold: -20, ratio: 2, attack: 20, release: 200, enabled: false }, bus: ['pgm'] },
];

const BUSES = ['pgm', 'pvw', 'mon', 'aux1', 'aux2'];

const TYPE_COLORS = {
  camera: '#3b82f6',
  mic: '#ef4444',
  aux: '#8b5cf6',
};

export default function AudioMixer() {
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [masterLevel, setMasterLevel] = useState(85);
  const [masterMuted, setMasterMuted] = useState(false);
  const [selectedCh, setSelectedCh] = useState(null);
  const [vuLevels, setVuLevels] = useState({});
  const [masterVu, setMasterVu] = useState({ left: 0, right: 0 });
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState([]);
  const [showEQ, setShowEQ] = useState(false);
  const animRef = useRef(null);

  // Simulate VU meter levels
  useEffect(() => {
    const animate = () => {
      setVuLevels(prev => {
        const next = {};
        channels.forEach(ch => {
          const base = ch.muted ? 0 : (ch.level / 100) * 0.8;
          const jitter = Math.random() * 0.2;
          const prevVal = prev[ch.id] || 0;
          next[ch.id] = prevVal * 0.7 + (base + jitter) * 0.3;
        });
        return next;
      });
      setMasterVu(prev => {
        const base = masterMuted ? 0 : (masterLevel / 100) * 0.85;
        const jitter = Math.random() * 0.15;
        return {
          left: prev.left * 0.7 + (base + jitter) * 0.3,
          right: prev.right * 0.7 + (base + jitter * 0.8) * 0.3,
        };
      });
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [channels, masterLevel, masterMuted]);

  const updateChannel = (id, updates) => {
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, ...updates } : ch));
  };

  const toggleBus = (chId, bus) => {
    setChannels(prev => prev.map(ch => {
      if (ch.id !== chId) return ch;
      const buses = ch.bus.includes(bus) ? ch.bus.filter(b => b !== bus) : [...ch.bus, bus];
      return { ...ch, bus: buses };
    }));
  };

  const renderVuMeter = (level, color = '#4ade80', height = 180) => {
    const percent = Math.min(level * 100, 100);
    const peakColor = percent > 85 ? '#ef4444' : percent > 70 ? '#fbbf24' : color;
    return (
      <div className="vu-meter" style={{ height }}>
        <div className="vu-meter-track">
          <div className="vu-meter-fill" style={{
            height: `${percent}%`,
            background: `linear-gradient(to top, ${color}, ${peakColor})`,
            boxShadow: `0 0 8px ${peakColor}40`,
          }}></div>
          {/* Peak indicator lines */}
          <div className="vu-meter-marks">
            <div className="vu-mark" style={{ bottom: '100%' }}><span>0</span></div>
            <div className="vu-mark" style={{ bottom: '85%' }}><span>-6</span></div>
            <div className="vu-mark" style={{ bottom: '70%' }}><span>-12</span></div>
            <div className="vu-mark" style={{ bottom: '50%' }}><span>-20</span></div>
            <div className="vu-mark" style={{ bottom: '25%' }}><span>-40</span></div>
            <div className="vu-mark" style={{ bottom: '0%' }}><span>-∞</span></div>
          </div>
        </div>
      </div>
    );
  };

  const renderEqCurve = (eq) => {
    // Simple SVG EQ visualization
    const mid = 30;
    const lowY = mid - eq.low * 3;
    const midY = mid - eq.mid * 3;
    const highY = mid - eq.high * 3;
    return (
      <svg viewBox="0 0 60 60" style={{ width: '100%', height: 50 }}>
        <line x1="0" y1="30" x2="60" y2="30" stroke="#334155" strokeWidth="0.5" />
        <path d={`M0,${lowY} Q15,${lowY} 20,${midY} Q30,${midY} 40,${highY} Q50,${highY} 60,${highY}`}
          fill="none" stroke="#6366f1" strokeWidth="1.5" />
        <circle cx="10" cy={lowY} r="2" fill="#ef4444" />
        <circle cx="30" cy={midY} r="2" fill="#fbbf24" />
        <circle cx="50" cy={highY} r="2" fill="#4ade80" />
      </svg>
    );
  };

  const sel = selectedCh ? channels.find(c => c.id === selectedCh) : null;

  return (
    <div className="audio-mixer">
      <div className="mix-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>🎚️ Audio Mixer</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>Professional broadcast audio mixing console</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-input" style={{ width: 150, fontSize: '.75rem' }} onChange={e => {
            const preset = presets.find(p => p.name === e.target.value);
            if (preset) setChannels(preset.channels);
          }}>
            <option value="">Load Preset...</option>
            {presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <button className="btn btn-sm btn-outline" onClick={() => {
            const name = prompt('Preset name:');
            if (name) setPresets(prev => [...prev, { name, channels: [...channels] }]);
          }}>💾 Save</button>
        </div>
      </div>

      <div className="mix-console">
        {/* Channel Strips */}
        <div className="mix-strips">
          {channels.map(ch => {
            const color = TYPE_COLORS[ch.type] || '#64748b';
            const vu = vuLevels[ch.id] || 0;
            return (
              <div key={ch.id} className={`mix-strip ${selectedCh === ch.id ? 'selected' : ''} ${ch.muted ? 'muted' : ''}`}
                onClick={() => setSelectedCh(ch.id)}>
                {/* Channel label */}
                <div className="mix-strip-label" style={{ borderColor: color }}>
                  <span className="mix-strip-name">{ch.name}</span>
                  <span className="mix-strip-type" style={{ color }}>{ch.type}</span>
                </div>

                {/* EQ mini curve */}
                {renderEqCurve(ch.eq)}

                {/* VU + Fader area */}
                <div className="mix-fader-area">
                  {renderVuMeter(vu, color)}
                  <div className="mix-fader-wrap">
                    <input type="range" orient="vertical" min="0" max="100" value={ch.level}
                      className="mix-fader"
                      style={{ accentColor: color }}
                      onChange={e => updateChannel(ch.id, { level: parseInt(e.target.value) })} />
                  </div>
                </div>

                {/* Level readout */}
                <div className="mix-level-readout">{ch.level}</div>

                {/* Pan */}
                <div className="mix-pan">
                  <span style={{ fontSize: '.55rem' }}>L</span>
                  <input type="range" min="-100" max="100" value={ch.pan}
                    className="mix-pan-knob"
                    onChange={e => updateChannel(ch.id, { pan: parseInt(e.target.value) })} />
                  <span style={{ fontSize: '.55rem' }}>R</span>
                </div>

                {/* Buttons */}
                <div className="mix-btn-row">
                  <button className={`mix-ch-btn ${ch.muted ? 'active-red' : ''}`}
                    onClick={(e) => { e.stopPropagation(); updateChannel(ch.id, { muted: !ch.muted }); }}>M</button>
                  <button className={`mix-ch-btn ${ch.solo ? 'active-yellow' : ''}`}
                    onClick={(e) => { e.stopPropagation(); updateChannel(ch.id, { solo: !ch.solo }); }}>S</button>
                  <button className={`mix-ch-btn ${ch.afv ? 'active-green' : ''}`}
                    onClick={(e) => { e.stopPropagation(); updateChannel(ch.id, { afv: !ch.afv }); }}>AFV</button>
                </div>
              </div>
            );
          })}

          {/* Master Strip */}
          <div className="mix-strip mix-master">
            <div className="mix-strip-label" style={{ borderColor: '#f59e0b', background: 'rgba(245,158,11,.1)' }}>
              <span className="mix-strip-name" style={{ fontWeight: 900 }}>MASTER</span>
              <span className="mix-strip-type" style={{ color: '#f59e0b' }}>PGM</span>
            </div>

            <div style={{ display: 'flex', gap: 2, justifyContent: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: '.6rem', color: '#4ade80' }}>L</span>
              <span style={{ fontSize: '.6rem', color: '#4ade80' }}>R</span>
            </div>

            <div className="mix-fader-area" style={{ gap: 2 }}>
              {renderVuMeter(masterVu.left, '#4ade80')}
              {renderVuMeter(masterVu.right, '#4ade80')}
              <div className="mix-fader-wrap">
                <input type="range" orient="vertical" min="0" max="100" value={masterLevel}
                  className="mix-fader"
                  style={{ accentColor: '#f59e0b' }}
                  onChange={e => setMasterLevel(parseInt(e.target.value))} />
              </div>
            </div>

            <div className="mix-level-readout" style={{ color: '#f59e0b', fontWeight: 900 }}>{masterLevel}</div>

            <div className="mix-btn-row">
              <button className={`mix-ch-btn ${masterMuted ? 'active-red' : ''}`}
                onClick={() => setMasterMuted(!masterMuted)} style={{ flex: 1 }}>
                {masterMuted ? '🔇 MUTED' : '🔊'}
              </button>
            </div>
          </div>
        </div>

        {/* Channel Detail Panel */}
        {sel && (
          <div className="mix-detail">
            <div className="mix-detail-header">
              <h3 style={{ margin: 0 }}>{sel.name} — Detail</h3>
              <button className="btn btn-icon btn-ghost btn-xs" onClick={() => setSelectedCh(null)}>✕</button>
            </div>

            {/* EQ Section */}
            <div className="mix-detail-section">
              <div className="mix-detail-section-title">🎛️ Equalizer (3-Band)</div>
              {renderEqCurve(sel.eq)}
              <div className="mix-eq-controls">
                {['low', 'mid', 'high'].map(band => (
                  <div key={band} className="mix-eq-band">
                    <label style={{ fontSize: '.65rem', textTransform: 'uppercase', color: band === 'low' ? '#ef4444' : band === 'mid' ? '#fbbf24' : '#4ade80' }}>
                      {band}
                    </label>
                    <input type="range" min="-12" max="12" value={sel.eq[band]}
                      className="mix-eq-slider"
                      onChange={e => updateChannel(sel.id, { eq: { ...sel.eq, [band]: parseInt(e.target.value) } })} />
                    <span style={{ fontSize: '.65rem', fontFamily: 'var(--mono)' }}>{sel.eq[band] > 0 ? '+' : ''}{sel.eq[band]} dB</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compressor */}
            <div className="mix-detail-section">
              <div className="mix-detail-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>🔧 Compressor</span>
                <button className={`btn btn-xs ${sel.compressor.enabled ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => updateChannel(sel.id, { compressor: { ...sel.compressor, enabled: !sel.compressor.enabled } })}>
                  {sel.compressor.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="mix-comp-controls">
                {[
                  { key: 'threshold', label: 'Threshold', min: -60, max: 0, unit: 'dB' },
                  { key: 'ratio', label: 'Ratio', min: 1, max: 20, unit: ':1' },
                  { key: 'attack', label: 'Attack', min: 1, max: 100, unit: 'ms' },
                  { key: 'release', label: 'Release', min: 10, max: 500, unit: 'ms' },
                ].map(p => (
                  <div key={p.key} className="mix-comp-param">
                    <label>{p.label}</label>
                    <input type="range" min={p.min} max={p.max} value={sel.compressor[p.key]}
                      onChange={e => updateChannel(sel.id, { compressor: { ...sel.compressor, [p.key]: parseInt(e.target.value) } })} />
                    <span>{sel.compressor[p.key]}{p.unit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bus Routing */}
            <div className="mix-detail-section">
              <div className="mix-detail-section-title">🔀 Bus Routing</div>
              <div className="mix-bus-grid">
                {BUSES.map(bus => (
                  <button key={bus} className={`mix-bus-btn ${sel.bus.includes(bus) ? 'active' : ''}`}
                    onClick={() => toggleBus(sel.id, bus)}>
                    {bus.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
