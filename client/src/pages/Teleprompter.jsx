import { useState, useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════
   TELEPROMPTER — Script Feed for On-Camera Talent
   ═══════════════════════════════════════════════════════════ */

export default function Teleprompter() {
  const [scripts, setScripts] = useState([
    { id: 'script-1', title: 'Welcome Script', text: 'नमस्ते और स्वागत है आपका इस विशेष प्रसारण में। \n\nWelcome to today\'s special broadcast from Loyadham.\n\nWe are honored to have you join us for this auspicious occasion. Please stay tuned as we begin our program.\n\nThanks to all our volunteers and technical crew for making this broadcast possible.\n\nLet us begin with a prayer...', cuePoints: [0, 3, 6] },
    { id: 'script-2', title: 'Closing Script', text: 'Thank you for watching today\'s broadcast.\n\nWe hope you were blessed and inspired by today\'s program.\n\nPlease join us again next week for another special event.\n\nJay Swaminarayan! 🙏\n\nजय स्वामिनारायण! 🙏', cuePoints: [0, 4] },
  ]);
  const [activeScript, setActiveScript] = useState(null);
  const [scrollSpeed, setScrollSpeed] = useState(2);
  const [isScrolling, setIsScrolling] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState('#000000');
  const [editScript, setEditScript] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const scrollRef = useRef(null);
  const scrollTimerRef = useRef(null);

  useEffect(() => {
    if (isScrolling && scrollRef.current) {
      scrollTimerRef.current = setInterval(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop += scrollSpeed;
          // Stop at bottom
          if (scrollRef.current.scrollTop >= scrollRef.current.scrollHeight - scrollRef.current.clientHeight) {
            setIsScrolling(false);
          }
        }
      }, 50);
    } else {
      clearInterval(scrollTimerRef.current);
    }
    return () => clearInterval(scrollTimerRef.current);
  }, [isScrolling, scrollSpeed]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); setIsScrolling(prev => !prev); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setScrollSpeed(prev => Math.min(prev + 0.5, 10)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setScrollSpeed(prev => Math.max(prev - 0.5, 0.5)); }
      if (e.key === 'Home') { e.preventDefault(); if (scrollRef.current) scrollRef.current.scrollTop = 0; }
      if (e.key === 'End') { e.preventDefault(); if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const saveScript = () => {
    if (!editTitle.trim()) return;
    if (editScript) {
      setScripts(prev => prev.map(s => s.id === editScript.id ? { ...s, title: editTitle, text: editText } : s));
    } else {
      setScripts(prev => [...prev, { id: `script-${Date.now()}`, title: editTitle, text: editText, cuePoints: [] }]);
    }
    setEditScript(null);
    setEditTitle('');
    setEditText('');
  };

  return (
    <div className="teleprompter-page">
      {/* Control Bar */}
      <div className="tp-controls">
        <div className="tp-controls-left">
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>📜 Teleprompter</h2>
        </div>
        <div className="tp-controls-center">
          <button className={`btn btn-sm ${isScrolling ? 'btn-danger' : 'btn-primary'}`} onClick={() => setIsScrolling(!isScrolling)}>
            {isScrolling ? '⏸ Pause' : '▶ Scroll'}
          </button>
          <button className="btn btn-sm btn-outline" onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; setIsScrolling(false); }}>
            ⏮ Reset
          </button>
          <div className="tp-speed">
            <span style={{ fontSize: '.7rem' }}>Speed</span>
            <input type="range" min="0.5" max="10" step="0.5" value={scrollSpeed}
              style={{ width: 100, accentColor: 'var(--accent)' }}
              onChange={e => setScrollSpeed(parseFloat(e.target.value))} />
            <span style={{ fontSize: '.7rem', fontFamily: 'var(--mono)' }}>{scrollSpeed}x</span>
          </div>
        </div>
        <div className="tp-controls-right">
          <button className={`btn btn-xs ${mirror ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMirror(!mirror)}>
            🪞 Mirror
          </button>
          <div className="tp-font-control">
            <button className="btn btn-xs btn-outline" onClick={() => setFontSize(prev => Math.max(prev - 4, 16))}>A-</button>
            <span style={{ fontSize: '.7rem', minWidth: 30, textAlign: 'center' }}>{fontSize}px</span>
            <button className="btn btn-xs btn-outline" onClick={() => setFontSize(prev => Math.min(prev + 4, 120))}>A+</button>
          </div>
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} title="Text color" style={{ width: 28, height: 28, border: 'none', cursor: 'pointer' }} />
          <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} title="BG color" style={{ width: 28, height: 28, border: 'none', cursor: 'pointer' }} />
        </div>
      </div>

      <div className="tp-layout">
        {/* Script List */}
        <div className="tp-sidebar">
          <div className="tp-sidebar-header">
            <span style={{ fontWeight: 700, fontSize: '.85rem' }}>📄 Scripts</span>
            <button className="btn btn-xs btn-primary" onClick={() => { setEditScript(null); setEditTitle(''); setEditText(''); }}>+</button>
          </div>
          {scripts.map(s => (
            <div key={s.id} className={`tp-script-item ${activeScript?.id === s.id ? 'active' : ''}`}
              onClick={() => { setActiveScript(s); if (scrollRef.current) scrollRef.current.scrollTop = 0; setIsScrolling(false); }}>
              <span className="tp-script-title">{s.title}</span>
              <span className="tp-script-lines">{s.text.split('\n').length} lines</span>
              <button className="btn btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); setEditScript(s); setEditTitle(s.title); setEditText(s.text); }}>✏️</button>
            </div>
          ))}

          {/* Edit area */}
          {(editScript !== null || editTitle !== undefined && editScript === null && editTitle !== '') && editScript !== undefined && (
            <div className="tp-edit-area">
              <input className="form-input" placeholder="Script title..." value={editTitle}
                onChange={e => setEditTitle(e.target.value)} />
              <textarea className="form-input" style={{ height: 120 }} placeholder="Script text..."
                value={editText} onChange={e => setEditText(e.target.value)} />
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-xs btn-primary" style={{ flex: 1 }} onClick={saveScript}>Save</button>
                <button className="btn btn-xs btn-outline" onClick={() => { setEditScript(undefined); setEditTitle(''); setEditText(''); }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="tp-shortcuts">
            <div className="tp-shortcut-title">⌨️ Shortcuts</div>
            <div className="tp-shortcut-item"><kbd>Space</kbd> Play/Pause</div>
            <div className="tp-shortcut-item"><kbd>↑</kbd> Speed +</div>
            <div className="tp-shortcut-item"><kbd>↓</kbd> Speed −</div>
            <div className="tp-shortcut-item"><kbd>Home</kbd> Go to top</div>
            <div className="tp-shortcut-item"><kbd>End</kbd> Go to bottom</div>
          </div>
        </div>

        {/* Prompter Display */}
        <div className="tp-display" style={{ background: bgColor, transform: mirror ? 'scaleX(-1)' : 'none' }}>
          {activeScript ? (
            <>
              {/* Scroll indicator */}
              <div className="tp-scroll-indicator">
                <div className="tp-center-line"></div>
              </div>
              <div ref={scrollRef} className="tp-scroll-area" style={{ color: textColor, fontSize }}>
                {/* Top padding */}
                <div style={{ height: '50vh' }}></div>
                {activeScript.text.split('\n').map((line, i) => (
                  <p key={i} className="tp-line" style={{
                    fontWeight: line.trim().startsWith('#') ? 800 : 400,
                    opacity: line.trim() === '' ? 0.3 : 1,
                  }}>
                    {line.trim() === '' ? '—' : line}
                  </p>
                ))}
                {/* Bottom padding */}
                <div style={{ height: '50vh' }}></div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: '4rem', opacity: 0.2 }}>📜</span>
              <p style={{ color: textColor, opacity: 0.4, fontSize: '1.2rem' }}>Select a script to begin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
