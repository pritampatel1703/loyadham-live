import { useState, useEffect, useRef } from 'react';

export default function Chat({ messages, onSend, username, isAdmin = false, disabled = false }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput('');
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <span>💬 Live Chat</span>
        <span className="chat-msg-count">{messages.length}</span>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>🙏 Be the first to say something!</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`chat-msg ${msg.isAdmin ? 'admin-msg' : ''}`}
            >
              <div className="chat-msg-meta">
                <span className="chat-msg-name">{msg.username}</span>
                <span className="chat-msg-time">{fmtTime(msg.timestamp)}</span>
              </div>
              <p className="chat-msg-text">{msg.message}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <input
          id={`chat-input-${isAdmin ? 'admin' : 'viewer'}`}
          className="chat-field"
          type="text"
          placeholder={disabled ? 'Chat will open when stream starts…' : 'Say something… (Enter↵)'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          disabled={disabled}
          maxLength={200}
        />
        <button
          className="chat-send"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          title="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
