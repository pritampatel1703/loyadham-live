import { useState } from 'react';

/* ═══════════════════════════════════════════════════════════
   NDI / SDI ROUTER — Signal Routing Matrix
   ═══════════════════════════════════════════════════════════ */

const DEMO_INPUTS = [
  { id: 'in1', name: 'CAM 1', type: 'SDI', format: '1080p60', status: 'active' },
  { id: 'in2', name: 'CAM 2', type: 'SDI', format: '1080p60', status: 'active' },
  { id: 'in3', name: 'CAM 3', type: 'SDI', format: '1080p60', status: 'active' },
  { id: 'in4', name: 'CAM 4', type: 'HDMI', format: '1080p30', status: 'active' },
  { id: 'in5', name: 'Laptop', type: 'NDI', format: '1080p30', status: 'active' },
  { id: 'in6', name: 'Graphics PC', type: 'NDI', format: '1080p60', status: 'active' },
  { id: 'in7', name: 'Media Player', type: 'SDI', format: '1080i60', status: 'inactive' },
  { id: 'in8', name: 'Remote Feed', type: 'SRT', format: '720p30', status: 'active' },
];

const DEMO_OUTPUTS = [
  { id: 'out1', name: 'PGM Monitor', type: 'SDI', connectedInput: 'in1' },
  { id: 'out2', name: 'PVW Monitor', type: 'SDI', connectedInput: 'in2' },
  { id: 'out3', name: 'Multiview', type: 'HDMI', connectedInput: null },
  { id: 'out4', name: 'Stream Encoder', type: 'NDI', connectedInput: 'in1' },
  { id: 'out5', name: 'Record Deck', type: 'SDI', connectedInput: 'in1' },
  { id: 'out6', name: 'Aux 1', type: 'SDI', connectedInput: null },
  { id: 'out7', name: 'Aux 2', type: 'NDI', connectedInput: null },
  { id: 'out8', name: 'LED Wall', type: 'HDMI', connectedInput: 'in6' },
];

const TYPE_COLORS = { SDI: '#3b82f6', HDMI: '#8b5cf6', NDI: '#22c55e', SRT: '#f59e0b' };

export default function SignalRouter() {
  const [inputs, setInputs] = useState(DEMO_INPUTS);
  const [outputs, setOutputs] = useState(DEMO_OUTPUTS);
  const [selectedInput, setSelectedInput] = useState(null);
  const [selectedOutput, setSelectedOutput] = useState(null);
  const [showAddInput, setShowAddInput] = useState(false);
  const [showAddOutput, setShowAddOutput] = useState(false);
  const [lockRouting, setLockRouting] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', type: 'SDI', format: '1080p60' });

  const routeSignal = (outputId, inputId) => {
    if (lockRouting) return;
    setOutputs(prev => prev.map(o => o.id === outputId ? { ...o, connectedInput: inputId } : o));
  };

  const clearRoute = (outputId) => {
    if (lockRouting) return;
    setOutputs(prev => prev.map(o => o.id === outputId ? { ...o, connectedInput: null } : o));
  };

  const handleMatrixClick = (inputId, outputId) => {
    if (lockRouting) return;
    const output = outputs.find(o => o.id === outputId);
    if (output?.connectedInput === inputId) {
      clearRoute(outputId);
    } else {
      routeSignal(outputId, inputId);
    }
  };

  const addInput = () => {
    if (!addForm.name) return;
    setInputs(prev => [...prev, { id: `in-${Date.now()}`, name: addForm.name, type: addForm.type, format: addForm.format, status: 'active' }]);
    setShowAddInput(false);
    setAddForm({ name: '', type: 'SDI', format: '1080p60' });
  };

  const addOutput = () => {
    if (!addForm.name) return;
    setOutputs(prev => [...prev, { id: `out-${Date.now()}`, name: addForm.name, type: addForm.type, connectedInput: null }]);
    setShowAddOutput(false);
    setAddForm({ name: '', type: 'SDI', format: '1080p60' });
  };

  return (
    <div className="router-page">
      <div className="router-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>🔌 Signal Router</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>NDI / SDI / HDMI signal routing matrix</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-xs ${lockRouting ? 'btn-danger' : 'btn-outline'}`} onClick={() => setLockRouting(!lockRouting)}>
            {lockRouting ? '🔒 Locked' : '🔓 Unlocked'}
          </button>
          <button className="btn btn-xs btn-outline" onClick={() => setShowAddInput(true)}>+ Input</button>
          <button className="btn btn-xs btn-outline" onClick={() => setShowAddOutput(true)}>+ Output</button>
        </div>
      </div>

      {/* Signal Type Legend */}
      <div className="router-legend">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <span key={type} className="router-legend-item">
            <span className="router-legend-dot" style={{ background: color }}></span>
            {type}
          </span>
        ))}
        <span className="router-legend-item">
          <span className="router-legend-dot" style={{ background: '#ef4444' }}></span>
          Active Route
        </span>
      </div>

      {/* Routing Matrix */}
      <div className="router-matrix-container">
        <div className="router-matrix">
          {/* Top-left corner */}
          <div className="router-corner">
            <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>IN → OUT ↓</span>
          </div>

          {/* Input headers (columns) */}
          {inputs.map(inp => (
            <div key={inp.id} className={`router-input-header ${selectedInput === inp.id ? 'selected' : ''}`}
              onClick={() => setSelectedInput(selectedInput === inp.id ? null : inp.id)}>
              <div className="router-header-name">{inp.name}</div>
              <div className="router-header-type" style={{ color: TYPE_COLORS[inp.type] }}>{inp.type}</div>
              <div className="router-header-format">{inp.format}</div>
              <span className={`router-status-dot ${inp.status}`}></span>
            </div>
          ))}

          {/* Output rows */}
          {outputs.map(out => {
            const connectedInput = inputs.find(i => i.id === out.connectedInput);
            return (
              <div key={out.id} className="router-output-row" style={{ display: 'contents' }}>
                {/* Output header */}
                <div className={`router-output-header ${selectedOutput === out.id ? 'selected' : ''}`}
                  onClick={() => setSelectedOutput(selectedOutput === out.id ? null : out.id)}>
                  <div className="router-header-name">{out.name}</div>
                  <div className="router-header-type" style={{ color: TYPE_COLORS[out.type] }}>{out.type}</div>
                  {connectedInput && <div className="router-header-connected">← {connectedInput.name}</div>}
                </div>

                {/* Matrix cells */}
                {inputs.map(inp => {
                  const isRouted = out.connectedInput === inp.id;
                  const isHighlighted = selectedInput === inp.id || selectedOutput === out.id;
                  return (
                    <div key={`${out.id}-${inp.id}`}
                      className={`router-cell ${isRouted ? 'routed' : ''} ${isHighlighted ? 'highlighted' : ''} ${lockRouting ? 'locked' : ''}`}
                      onClick={() => handleMatrixClick(inp.id, out.id)}>
                      {isRouted && <span className="router-cell-x">✕</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Routing Summary */}
      <div className="router-summary">
        <div className="router-summary-title">📋 Active Routes</div>
        <div className="router-routes-list">
          {outputs.filter(o => o.connectedInput).map(o => {
            const inp = inputs.find(i => i.id === o.connectedInput);
            return (
              <div key={o.id} className="router-route-item">
                <span className="router-route-src" style={{ borderColor: TYPE_COLORS[inp?.type] }}>{inp?.name}</span>
                <span className="router-route-arrow">→</span>
                <span className="router-route-dst" style={{ borderColor: TYPE_COLORS[o.type] }}>{o.name}</span>
                {!lockRouting && (
                  <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444' }} onClick={() => clearRoute(o.id)}>✕</button>
                )}
              </div>
            );
          })}
          {outputs.filter(o => o.connectedInput).length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>No active routes. Click matrix cells to route.</div>
          )}
        </div>
      </div>

      {/* Add Input/Output Modal */}
      {(showAddInput || showAddOutput) && (
        <div className="modal-overlay" onClick={() => { setShowAddInput(false); setShowAddOutput(false); }}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{showAddInput ? 'Add Input' : 'Add Output'}</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => { setShowAddInput(false); setShowAddOutput(false); }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} /></div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={addForm.type} onChange={e => setAddForm({...addForm, type: e.target.value})}>
                  {Object.keys(TYPE_COLORS).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {showAddInput && (
                <div className="form-group">
                  <label className="form-label">Format</label>
                  <select className="form-input" value={addForm.format} onChange={e => setAddForm({...addForm, format: e.target.value})}>
                    {['1080p60','1080p30','1080i60','720p60','720p30','4K30','4K60'].map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowAddInput(false); setShowAddOutput(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={showAddInput ? addInput : addOutput}>+ Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
