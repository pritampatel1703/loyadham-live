import { useState, useRef, useCallback, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════
   PTZ CAMERA CONTROL — Pan/Tilt/Zoom with Presets
   ═══════════════════════════════════════════════════════════ */

const DEMO_CAMERAS = [
  { id: 'ptz1', name: 'Main Stage PTZ', model: 'PTZ Optics 30x', ip: '192.168.1.101', protocol: 'VISCA', pan: 0, tilt: 0, zoom: 50, focus: 50, presets: [
    { id: 'p1', name: 'Wide Shot', pan: 0, tilt: 0, zoom: 20 },
    { id: 'p2', name: 'Speaker Close-up', pan: -15, tilt: 5, zoom: 80 },
    { id: 'p3', name: 'Audience Left', pan: -45, tilt: -5, zoom: 40 },
    { id: 'p4', name: 'Audience Right', pan: 45, tilt: -5, zoom: 40 },
  ]},
  { id: 'ptz2', name: 'Balcony PTZ', model: 'Lumens VC-A61P', ip: '192.168.1.102', protocol: 'VISCA', pan: 0, tilt: -10, zoom: 35, focus: 50, presets: [
    { id: 'p1', name: 'Overview', pan: 0, tilt: -10, zoom: 20 },
    { id: 'p2', name: 'Stage Center', pan: 0, tilt: -15, zoom: 60 },
  ]},
  { id: 'ptz3', name: 'Back Camera', model: 'BirdDog P200', ip: '192.168.1.103', protocol: 'NDI', pan: 0, tilt: 0, zoom: 30, focus: 50, presets: [
    { id: 'p1', name: 'Full Stage', pan: 0, tilt: 0, zoom: 15 },
  ]},
];

const PROTOCOLS = ['VISCA', 'VISCA-over-IP', 'NDI', 'ONVIF', 'CGI'];

export default function PTZControl() {
  const [cameras, setCameras] = useState(DEMO_CAMERAS);
  const [activeCam, setActiveCam] = useState(DEMO_CAMERAS[0].id);
  const [speed, setSpeed] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [autoFocus, setAutoFocus] = useState(true);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const joystickRef = useRef(null);
  const joystickAreaRef = useRef(null);

  const cam = cameras.find(c => c.id === activeCam);

  const updateCam = (updates) => {
    setCameras(prev => prev.map(c => c.id === activeCam ? { ...c, ...updates } : c));
  };

  const move = (dp, dt) => {
    updateCam({
      pan: Math.max(-180, Math.min(180, (cam?.pan || 0) + dp * speed)),
      tilt: Math.max(-90, Math.min(90, (cam?.tilt || 0) + dt * speed)),
    });
  };

  const recallPreset = (preset) => {
    updateCam({ pan: preset.pan, tilt: preset.tilt, zoom: preset.zoom });
  };

  const savePreset = () => {
    const name = prompt('Preset name:');
    if (!name || !cam) return;
    const newPreset = { id: `p-${Date.now()}`, name, pan: cam.pan, tilt: cam.tilt, zoom: cam.zoom };
    setCameras(prev => prev.map(c => c.id === activeCam ? { ...c, presets: [...c.presets, newPreset] } : c));
  };

  const deletePreset = (presetId) => {
    setCameras(prev => prev.map(c => c.id === activeCam ? { ...c, presets: c.presets.filter(p => p.id !== presetId) } : c));
  };

  // Joystick handling
  const handleJoystickStart = useCallback((e) => {
    setJoystickActive(true);
    e.preventDefault();
  }, []);

  const handleJoystickMove = useCallback((e) => {
    if (!joystickActive || !joystickAreaRef.current) return;
    const rect = joystickAreaRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height - 0.5) * 2));
    setJoystickPos({ x, y });
    move(x * 2, -y * 2);
  }, [joystickActive, cam, speed]);

  const handleJoystickEnd = useCallback(() => {
    setJoystickActive(false);
    setJoystickPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (joystickActive) {
      window.addEventListener('mousemove', handleJoystickMove);
      window.addEventListener('mouseup', handleJoystickEnd);
      window.addEventListener('touchmove', handleJoystickMove);
      window.addEventListener('touchend', handleJoystickEnd);
      return () => {
        window.removeEventListener('mousemove', handleJoystickMove);
        window.removeEventListener('mouseup', handleJoystickEnd);
        window.removeEventListener('touchmove', handleJoystickMove);
        window.removeEventListener('touchend', handleJoystickEnd);
      };
    }
  }, [joystickActive, handleJoystickMove, handleJoystickEnd]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); move(1, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(0, 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(0, -1); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); updateCam({ zoom: Math.min(100, (cam?.zoom || 50) + 5) }); }
      if (e.key === '-') { e.preventDefault(); updateCam({ zoom: Math.max(0, (cam?.zoom || 50) - 5) }); }
      // Number keys for presets
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && cam?.presets?.[num - 1]) {
        e.preventDefault();
        recallPreset(cam.presets[num - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cam, speed]);

  if (!cam) return <div className="empty-state"><div className="empty-icon">📹</div><h3>No PTZ cameras</h3></div>;

  return (
    <div className="ptz-page">
      <div className="ptz-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>🎯 PTZ Camera Control</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>Pan, tilt, zoom control with presets</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-input" style={{ width: 200, fontSize: '.78rem' }} value={activeCam} onChange={e => setActiveCam(e.target.value)}>
            {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="ptz-layout">
        {/* Left: Camera List */}
        <div className="ptz-cam-list">
          <div className="ptz-cam-list-title">📹 Cameras</div>
          {cameras.map(c => (
            <div key={c.id} className={`ptz-cam-item ${activeCam === c.id ? 'active' : ''}`} onClick={() => setActiveCam(c.id)}>
              <div className="ptz-cam-dot" style={{ background: activeCam === c.id ? '#4ade80' : '#64748b' }}></div>
              <div>
                <div className="ptz-cam-name">{c.name}</div>
                <div className="ptz-cam-model">{c.model} · {c.protocol}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Center: Joystick + Controls */}
        <div className="ptz-center">
          {/* Camera preview area */}
          <div className="ptz-preview">
            <div className="ptz-preview-video">
              <span style={{ fontSize: '3rem', opacity: 0.2 }}>📹</span>
              <div className="ptz-crosshair"></div>
            </div>
            <div className="ptz-pos-overlay">
              P: {cam.pan.toFixed(1)}° · T: {cam.tilt.toFixed(1)}° · Z: {cam.zoom}%
            </div>
          </div>

          <div className="ptz-controls-row">
            {/* Joystick */}
            <div className="ptz-joystick-area" ref={joystickAreaRef} onMouseDown={handleJoystickStart} onTouchStart={handleJoystickStart}>
              <div className="ptz-joystick-bg">
                <div className="ptz-joystick-crosshair-h"></div>
                <div className="ptz-joystick-crosshair-v"></div>
                <div className="ptz-joystick-knob" ref={joystickRef} style={{
                  transform: `translate(${joystickPos.x * 50}px, ${joystickPos.y * 50}px)`,
                }}>
                  <div className="ptz-joystick-inner"></div>
                </div>
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>Click & drag to pan/tilt</div>
            </div>

            {/* D-Pad buttons */}
            <div className="ptz-dpad">
              <button className="ptz-dpad-btn ptz-dpad-up" onMouseDown={() => move(0, 1)}>▲</button>
              <button className="ptz-dpad-btn ptz-dpad-left" onMouseDown={() => move(-1, 0)}>◄</button>
              <button className="ptz-dpad-btn ptz-dpad-center" onClick={() => updateCam({ pan: 0, tilt: 0 })}>⌂</button>
              <button className="ptz-dpad-btn ptz-dpad-right" onMouseDown={() => move(1, 0)}>►</button>
              <button className="ptz-dpad-btn ptz-dpad-down" onMouseDown={() => move(0, -1)}>▼</button>
            </div>

            {/* Zoom & Focus sliders */}
            <div className="ptz-sliders">
              <div className="ptz-slider-group">
                <label>🔍 Zoom</label>
                <input type="range" min="0" max="100" value={cam.zoom} onChange={e => updateCam({ zoom: parseInt(e.target.value) })} />
                <span>{cam.zoom}%</span>
              </div>
              <div className="ptz-slider-group">
                <label>🎯 Focus</label>
                <input type="range" min="0" max="100" value={cam.focus} disabled={autoFocus} onChange={e => updateCam({ focus: parseInt(e.target.value) })} />
                <span>{autoFocus ? 'AUTO' : cam.focus + '%'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn btn-xs ${autoFocus ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAutoFocus(!autoFocus)}>AF {autoFocus ? 'ON' : 'OFF'}</button>
              </div>
              <div className="ptz-slider-group">
                <label>⚡ Speed</label>
                <input type="range" min="1" max="10" value={speed} onChange={e => setSpeed(parseInt(e.target.value))} />
                <span>{speed}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Presets */}
        <div className="ptz-presets">
          <div className="ptz-presets-header">
            <span style={{ fontWeight: 700 }}>📌 Presets</span>
            <button className="btn btn-xs btn-primary" onClick={savePreset}>+ Save</button>
          </div>
          <div className="ptz-preset-list">
            {cam.presets.map((p, i) => (
              <div key={p.id} className="ptz-preset-item">
                <button className="ptz-preset-btn" onClick={() => recallPreset(p)}>
                  <span className="ptz-preset-num">{i + 1}</span>
                  <div>
                    <span className="ptz-preset-name">{p.name}</span>
                    <span className="ptz-preset-vals">P:{p.pan}° T:{p.tilt}° Z:{p.zoom}%</span>
                  </div>
                </button>
                <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444' }} onClick={() => deletePreset(p.id)}>✕</button>
              </div>
            ))}
          </div>
          <div className="ptz-shortcuts">
            <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>⌨️ Shortcuts</div>
            <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>
              <div>Arrow keys: Pan/Tilt</div>
              <div>+/−: Zoom In/Out</div>
              <div>1-9: Recall preset</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
