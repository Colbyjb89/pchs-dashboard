'use client';
import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'ava';
  content: string;
  timestamp: Date;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Ava({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleAsk() {
    if (!query.trim() || loading) return;
    const userMsg = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date() }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ava', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'ava',
        content: data.answer || 'I couldn\'t find an answer to that. Try rephrasing or check the dashboard directly.',
        timestamp: new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'ava',
        content: 'Connection error. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      padding: '0 0 0 0',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%',
        maxWidth: 600,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '70vh',
        animation: 'fadeIn 0.2s ease',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: 'linear-gradient(135deg, var(--accent), #7c4dff)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>✦</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, letterSpacing: '0.04em' }}>AVA</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Performance Assistant</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✦</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 4 }}>Ask Ava anything</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Try: "Who had the highest player load yesterday?" or "Is anyone in the ACWR red zone?"
              </div>
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {[
                  "Who hit a new personal best this week?",
                  "Which position group has the highest load?",
                  "Any players not seen in 4+ days?",
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => setQuery(suggestion)}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 100,
                      padding: '4px 12px',
                      fontSize: 11,
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >{suggestion}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              gap: 10,
              animation: 'fadeIn 0.2s ease',
            }}>
              <div style={{
                width: 28, height: 28, flexShrink: 0,
                borderRadius: '50%',
                background: msg.role === 'user' ? 'var(--dim)' : 'linear-gradient(135deg, var(--accent), #7c4dff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: msg.role === 'user' ? 12 : 14,
                color: 'white',
              }}>
                {msg.role === 'user' ? '◉' : '✦'}
              </div>
              <div style={{
                maxWidth: '80%',
                background: msg.role === 'user' ? 'var(--dim)' : 'var(--card)',
                border: `1px solid ${msg.role === 'user' ? 'transparent' : 'var(--border)'}`,
                borderRadius: 12,
                padding: '10px 14px',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--text)',
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{
                width: 28, height: 28,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), #7c4dff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14,
              }}>✦</div>
              <div style={{
                display: 'flex', gap: 4, padding: '12px 16px',
                background: 'var(--card)', borderRadius: 12,
                border: '1px solid var(--border)',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: `pulse-dot 1.2s ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAsk()}
              placeholder="Ask Ava anything about your data..."
              style={{
                flex: 1,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 14px',
                color: 'var(--text)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={handleAsk}
              disabled={!query.trim() || loading}
              className="btn btn-primary"
              style={{ opacity: (!query.trim() || loading) ? 0.5 : 1 }}
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
