import { useState } from 'react';

/* ═══════════════════════════════════════════════════════════
   MACRO ENGINE — Visual Automation Builder
   ═══════════════════════════════════════════════════════════ */

const ACTION_CATALOG = [
  { id: 'switch-cam', label: 'Switch Camera', icon: '📹', category: 'switcher', params: [{ key: 'input', label: 'Camera Input', type: 'number', default: 1 }] },
  { id: 'cut', label: 'Cut Transition', icon: '✂️', category: 'switcher', params: [] },
  { id: 'auto', label: 'Auto Transition', icon: '🔄', category: 'switcher', params: [] },
  { id: 'ftb', label: 'Fade to Black', icon: '⬛', category: 'switcher', params: [] },
  { id: 'show-graphic', label: 'Show Graphic', icon: '🎨', category: 'graphics', params: [{ key: 'templateId', label: 'Template ID', type: 'text', default: '' }] },
  { id: 'hide-graphic', label: 'Hide Graphic', icon: '🚫', category: 'graphics', params: [{ key: 'templateId', label: 'Template ID', type: 'text', default: '' }] },
  { id: 'hide-all-graphics', label: 'Hide All Graphics', icon: '🧹', category: 'graphics', params: [] },
  { id: 'set-audio-level', label: 'Set Audio Level', icon: '🔊', category: 'audio', params: [{ key: 'channel', label: 'Channel', type: 'number', default: 1 }, { key: 'level', label: 'Level (0-100)', type: 'number', default: 75 }] },
  { id: 'mute-audio', label: 'Mute Channel', icon: '🔇', category: 'audio', params: [{ key: 'channel', label: 'Channel', type: 'number', default: 1 }] },
  { id: 'unmute-audio', label: 'Unmute Channel', icon: '🔈', category: 'audio', params: [{ key: 'channel', label: 'Channel', type: 'number', default: 1 }] },
  { id: 'wait', label: 'Wait / Delay', icon: '⏱️', category: 'flow', params: [{ key: 'duration', label: 'Duration (ms)', type: 'number', default: 2000 }] },
  { id: 'start-recording', label: 'Start Recording', icon: '⏺️', category: 'system', params: [] },
  { id: 'stop-recording', label: 'Stop Recording', icon: '⏹️', category: 'system', params: [] },
  { id: 'start-streaming', label: 'Start Streaming', icon: '📡', category: 'system', params: [] },
  { id: 'stop-streaming', label: 'Stop Streaming', icon: '🛑', category: 'system', params: [] },
  { id: 'pip-enable', label: 'Enable PiP', icon: '🖼️', category: 'switcher', params: [{ key: 'source', label: 'PiP Source', type: 'number', default: 2 }] },
  { id: 'pip-disable', label: 'Disable PiP', icon: '❌', category: 'switcher', params: [] },
];

const TRIGGER_TYPES = [
  { id: 'manual', label: '🖱️ Manual (Button)', desc: 'Trigger by clicking the Run button' },
  { id: 'scheduled', label: '📅 Scheduled', desc: 'Run at a specific time' },
  { id: 'keyboard', label: '⌨️ Keyboard Shortcut', desc: 'Trigger with a key combo' },
  { id: 'tally', label: '🔴 Tally Change', desc: 'Run when a source goes on-air' },
  { id: 'webhook', label: '🌐 Webhook / API', desc: 'Trigger via HTTP POST' },
];

const CAT_COLORS = {
  switcher: '#3b82f6', graphics: '#8b5cf6', audio: '#f59e0b', flow: '#64748b', system: '#10b981',
};

export default function Macros() {
  const [macros, setMacros] = useState([
    {
      id: 'macro-1', name: 'Show Opening', description: 'Display title card, wait, then switch to cam 1',
      trigger: { type: 'manual' },
      steps: [
        { id: 's1', actionId: 'show-graphic', params: { templateId: 'tpl-title-card' } },
        { id: 's2', actionId: 'wait', params: { duration: 4000 } },
        { id: 's3', actionId: 'hide-all-graphics', params: {} },
        { id: 's4', actionId: 'switch-cam', params: { input: 1 } },
        { id: 's5', actionId: 'auto', params: {} },
      ],
      isRunning: false,
    },
    {
      id: 'macro-2', name: 'Go Live Sequence', description: 'Start streaming, recording, and show countdown',
      trigger: { type: 'manual' },
      steps: [
        { id: 's1', actionId: 'start-recording', params: {} },
        { id: 's2', actionId: 'show-graphic', params: { templateId: 'tpl-countdown-timer' } },
        { id: 's3', actionId: 'wait', params: { duration: 10000 } },
        { id: 's4', actionId: 'hide-all-graphics', params: {} },
        { id: 's5', actionId: 'start-streaming', params: {} },
        { id: 's6', actionId: 'switch-cam', params: { input: 1 } },
        { id: 's7', actionId: 'auto', params: {} },
      ],
      isRunning: false,
    },
  ]);

  const [selectedMacro, setSelectedMacro] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(null);
  const [runningStep, setRunningStep] = useState(null);
  const [actionFilter, setActionFilter] = useState('all');

  const sel = selectedMacro ? macros.find(m => m.id === selectedMacro) : null;

  const runMacro = async (macro) => {
    setMacros(prev => prev.map(m => m.id === macro.id ? { ...m, isRunning: true } : m));
    for (let i = 0; i < macro.steps.length; i++) {
      const step = macro.steps[i];
      setRunningStep(`${macro.id}-${step.id}`);
      const action = ACTION_CATALOG.find(a => a.id === step.actionId);
      if (step.actionId === 'wait') {
        await new Promise(r => setTimeout(r, step.params.duration || 1000));
      } else {
        // Simulate action execution
        console.log(`[Macro] Executing: ${action?.label}`, step.params);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    setRunningStep(null);
    setMacros(prev => prev.map(m => m.id === macro.id ? { ...m, isRunning: false } : m));
  };

  const addStep = (actionId) => {
    if (!editData) return;
    const action = ACTION_CATALOG.find(a => a.id === actionId);
    const params = {};
    (action?.params || []).forEach(p => params[p.key] = p.default);
    const newStep = { id: `s-${Date.now()}`, actionId, params };
    setEditData({ ...editData, steps: [...(editData.steps || []), newStep] });
  };

  const removeStep = (stepId) => {
    if (!editData) return;
    setEditData({ ...editData, steps: editData.steps.filter(s => s.id !== stepId) });
  };

  const saveMacro = () => {
    if (!editData?.name) return;
    if (editData.id) {
      setMacros(prev => prev.map(m => m.id === editData.id ? editData : m));
    } else {
      setMacros(prev => [...prev, { ...editData, id: `macro-${Date.now()}`, isRunning: false }]);
    }
    setEditMode(false);
    setEditData(null);
  };

  const deleteMacro = (id) => {
    setMacros(prev => prev.filter(m => m.id !== id));
    if (selectedMacro === id) setSelectedMacro(null);
  };

  return (
    <div className="macros-page">
      <div className="macro-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>⚡ Macros & Automation</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>Automate complex production sequences with visual workflows</p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => {
          setEditMode(true);
          setEditData({ name: '', description: '', trigger: { type: 'manual' }, steps: [] });
        }}>+ New Macro</button>
      </div>

      <div className="macro-layout">
        {/* Macro List */}
        <div className="macro-list-panel">
          <div className="macro-list-header">
            <span style={{ fontWeight: 700 }}>📋 Macro Library</span>
            <span className="badge badge-info" style={{ fontSize: '.6rem' }}>{macros.length}</span>
          </div>
          {macros.map(m => (
            <div key={m.id} className={`macro-item ${selectedMacro === m.id ? 'selected' : ''} ${m.isRunning ? 'running' : ''}`}
              onClick={() => setSelectedMacro(m.id)}>
              <div className="macro-item-top">
                <span className="macro-item-name">{m.name}</span>
                {m.isRunning && <span className="badge badge-danger" style={{ fontSize: '.5rem', animation: 'pulse 1s infinite' }}>RUNNING</span>}
              </div>
              <div className="macro-item-desc">{m.description || 'No description'}</div>
              <div className="macro-item-meta">
                <span>{TRIGGER_TYPES.find(t => t.id === m.trigger.type)?.label || 'Manual'}</span>
                <span>{m.steps.length} steps</span>
              </div>
              <div className="macro-item-actions" style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                <button className="btn btn-xs btn-primary" onClick={(e) => { e.stopPropagation(); runMacro(m); }}
                  disabled={m.isRunning}>▶ Run</button>
                <button className="btn btn-xs btn-outline" onClick={(e) => { e.stopPropagation(); setEditMode(true); setEditData({...m}); }}>✏️</button>
                <button className="btn btn-xs btn-outline" style={{ color: '#ef4444' }}
                  onClick={(e) => { e.stopPropagation(); deleteMacro(m.id); }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>

        {/* Macro Detail / Timeline */}
        <div className="macro-detail-panel">
          {sel ? (
            <>
              <div className="macro-detail-header">
                <div>
                  <h3 style={{ margin: 0 }}>{sel.name}</h3>
                  <p style={{ margin: 0, fontSize: '.75rem', color: 'var(--text-muted)' }}>{sel.description}</p>
                </div>
                <button className={`btn btn-sm ${sel.isRunning ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => runMacro(sel)} disabled={sel.isRunning}>
                  {sel.isRunning ? '⏳ Running...' : '▶ Run Macro'}
                </button>
              </div>

              {/* Timeline */}
              <div className="macro-timeline">
                {sel.steps.map((step, i) => {
                  const action = ACTION_CATALOG.find(a => a.id === step.actionId);
                  const isActive = runningStep === `${sel.id}-${step.id}`;
                  const catColor = CAT_COLORS[action?.category] || '#64748b';
                  return (
                    <div key={step.id} className={`macro-step ${isActive ? 'active' : ''}`}>
                      <div className="macro-step-num" style={{ background: catColor }}>{i + 1}</div>
                      <div className="macro-step-connector"></div>
                      <div className="macro-step-card" style={{ borderLeftColor: catColor }}>
                        <div className="macro-step-icon">{action?.icon || '❓'}</div>
                        <div className="macro-step-info">
                          <div className="macro-step-name">{action?.label || step.actionId}</div>
                          <div className="macro-step-params">
                            {Object.entries(step.params).map(([k, v]) => (
                              <span key={k} className="macro-param-chip">{k}: {v}</span>
                            ))}
                          </div>
                        </div>
                        {isActive && <div className="macro-step-running">⏳</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>⚡</div>
              <p>Select a macro to view its timeline</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editMode && editData && (
        <div className="modal-overlay" onClick={() => setEditMode(false)}>
          <div className="modal" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editData.id ? 'Edit Macro' : 'New Macro'}</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setEditMode(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Macro Name</label>
                  <input className="form-input" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Trigger</label>
                  <select className="form-input" value={editData.trigger?.type || 'manual'}
                    onChange={e => setEditData({...editData, trigger: { type: e.target.value }})}>
                    {TRIGGER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" value={editData.description || ''} onChange={e => setEditData({...editData, description: e.target.value})} />
              </div>

              {/* Steps builder */}
              <div className="form-group">
                <label className="form-label">Steps ({editData.steps?.length || 0})</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {(editData.steps || []).map((step, i) => {
                    const action = ACTION_CATALOG.find(a => a.id === step.actionId);
                    return (
                      <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: '.8rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-muted)', width: 20 }}>{i+1}</span>
                        <span>{action?.icon} {action?.label}</span>
                        {Object.entries(step.params).map(([k,v]) => (
                          <input key={k} className="form-input" style={{ width: 80, fontSize: '.7rem' }}
                            value={v} onChange={e => {
                              const steps = [...editData.steps];
                              steps[i] = { ...steps[i], params: { ...steps[i].params, [k]: e.target.value } };
                              setEditData({ ...editData, steps });
                            }} placeholder={k} />
                        ))}
                        <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444', marginLeft: 'auto' }}
                          onClick={() => removeStep(step.id)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action catalog */}
              <div className="form-group">
                <label className="form-label">Add Action</label>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                  {['all', ...Object.keys(CAT_COLORS)].map(cat => (
                    <button key={cat} className={`btn btn-xs ${actionFilter === cat ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setActionFilter(cat)}>{cat}</button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                  {ACTION_CATALOG.filter(a => actionFilter === 'all' || a.category === actionFilter).map(a => (
                    <button key={a.id} className="btn btn-xs btn-outline" style={{ justifyContent: 'flex-start', gap: 4 }}
                      onClick={() => addStep(a.id)}>
                      {a.icon} {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setEditMode(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveMacro}>💾 Save Macro</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
