import { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api';

export function SophiaTab() {
  const [view, setView] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [brainDocs, setBrainDocs] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [dueReminders, setDueReminders] = useState([]);
  const [brainSearch, setBrainSearch] = useState('');
  const [brainResults, setBrainResults] = useState(null);
  const [stats, setStats] = useState({ cost: 0, tokens: 0, requests: 0 });
  const [listening, setListening] = useState(false);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Load data
  const loadBrain = useCallback(async () => {
    try { setBrainDocs(await fetch(`${API}/pet/brain`).then(r => r.json())); } catch(e) {}
  }, []);
  const loadReminders = useCallback(async () => {
    try {
      setReminders(await fetch(`${API}/pet/reminders?done=false`).then(r => r.json()));
      setDueReminders(await fetch(`${API}/pet/reminders/due`).then(r => r.json()));
    } catch(e) {}
  }, []);
  const loadStats = useCallback(async () => {
    try {
      const d = await fetch(`${API}/dashboard`).then(r => r.json());
      setStats({ cost: d.today?.cost_today || 0, tokens: d.today?.tokens_today || 0, requests: d.today?.requests_today || 0 });
    } catch(e) {}
  }, []);

  useEffect(() => { loadBrain(); loadReminders(); loadStats(); }, [loadBrain, loadReminders, loadStats]);
  useEffect(() => { const i = setInterval(loadReminders, 15000); return () => clearInterval(i); }, [loadReminders]);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages, thinking]);

  // Voice
  const startVoice = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!recognitionRef.current) {
      const rec = new SR();
      rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US';
      rec.onresult = (e) => { setInput(prev => prev + e.results[0][0].transcript); };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recognitionRef.current = rec;
    }
    recognitionRef.current.start();
    setListening(true);
  }, []);

  const speak = useCallback((text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.1; u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    }
  }, []);

  // Reminder actions
  const addReminder = useCallback(async () => {
    const msg = prompt('Reminder message:');
    if (!msg) return;
    const time = prompt('When? (e.g., "in 10 minutes", "tomorrow at 3pm", "2026-08-01 15:00")') || 'in 30 minutes';
    // Parse natural language to ISO-like via simple heuristic, or just pass as-is
    let due_at = time;
    if (time.startsWith('in ')) {
      const m = time.match(/in (\d+) (minute|hour|day)s?/);
      if (m) {
        const n = parseInt(m[1]), unit = m[2];
        const ms = unit === 'minute' ? n * 60000 : unit === 'hour' ? n * 3600000 : n * 86400000;
        due_at = new Date(Date.now() + ms).toISOString();
      }
    } else if (time.toLowerCase().includes('tomorrow')) {
      const t = time.match(/(\d+)(am|pm)/i);
      const h = t ? (parseInt(t[1]) + (t[2].toLowerCase() === 'pm' && parseInt(t[1]) !== 12 ? 12 : 0)) : 9;
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0);
      due_at = d.toISOString();
    }
    try {
      await fetch(`${API}/pet/reminders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, due_at }) });
      loadReminders();
    } catch(e) {}
  }, [loadReminders]);

  const doneReminder = useCallback(async (id) => {
    try { await fetch(`${API}/pet/reminders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: true }) }); loadReminders(); } catch(e) {}
  }, [loadReminders]);

  const deleteReminder = useCallback(async (id) => {
    try { await fetch(`${API}/pet/reminders/${id}`, { method: 'DELETE' }); loadReminders(); } catch(e) {}
  }, [loadReminders]);

  // Brain actions
  const togglePin = useCallback(async (id, pinned) => {
    try { await fetch(`${API}/pet/brain/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !pinned }) }); loadBrain(); } catch(e) {}
  }, [loadBrain]);
  const deleteDoc = useCallback(async (id) => {
    try { await fetch(`${API}/pet/brain/${id}`, { method: 'DELETE' }); loadBrain(); setBrainResults(null); } catch(e) {}
  }, [loadBrain]);
  const searchBrain = useCallback(async () => {
    if (!brainSearch.trim()) { setBrainResults(null); return; }
    try {
      const r = await fetch(`${API}/pet/brain/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: brainSearch, top_k: 8 }) });
      setBrainResults(await r.json());
    } catch(e) {}
  }, [brainSearch]);
  const embedAll = useCallback(async () => {
    try { await fetch(`${API}/pet/brain/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); } catch(e) {}
  }, []);

  // Chat
  const send = useCallback(async () => {
    if (!input.trim() || thinking) return;
    const msg = input.trim(); setInput('');
    const newMsgs = [...messages, { role: 'user', content: msg }];
    setMessages(newMsgs); setThinking(true);
    try {
      const h = messages.map(m => ({ role: m.role, content: m.content }));
      const r = await fetch(`${API}/pet/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, history: h }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setMessages([...newMsgs, { role: 'assistant', content: d.reply }]);
      // Auto-speak
      if (d.reply.length < 200) speak(d.reply);
    } catch(e) { setMessages([...newMsgs, { role: 'assistant', content: '*brain hiccup* — try again?' }]); }
    finally { setThinking(false); }
  }, [input, thinking, messages, speak]);

  const dueCount = dueReminders.length;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, height: 'calc(100vh - 100px)',
      fontFamily: "'Inter',-apple-system,system-ui,sans-serif",
    }}>
      {/* Left: Chat */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)', background: '#0a0a0f',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🧠</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Sophia</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>WGW Second Brain · {stats.requests} today</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '4px 10px', background: '#12121a', borderRadius: 6 }}>
              💵 ${stats.cost.toFixed(4)} · 📊 {stats.tokens >= 1e6 ? (stats.tokens/1e6).toFixed(1)+'M' : stats.tokens >= 1e3 ? (stats.tokens/1e3).toFixed(1)+'K' : stats.tokens}
            </span>
            <button onClick={startVoice} style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: listening ? '#22c55e' : '#12121a', color: listening ? '#000' : 'var(--text-dim)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>{listening ? '🎤 Listening...' : '🎤 Voice'}</button>
          </div>
        </div>

        <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && !thinking && (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 14, padding: '60px 20px', lineHeight: 1.8 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Hey, I'm Sophia</div>
              <div style={{ marginTop: 6 }}>Your second brain, ready anytime.</div>
              <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {['What do you know?', 'Help me plan my day', 'Search my brain', 'Set a reminder'].map((q, i) => (
                  <button key={i} onClick={() => setInput(q)} style={{
                    padding: '8px 14px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)',
                    background: '#12121a', color: 'var(--text-dim)', cursor: 'pointer',
                  }}>{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 16px', borderRadius: 14, fontSize: 14, lineHeight: 1.6,
                background: m.role === 'user' ? 'var(--accent)' : '#1a1a25',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{m.content}</div>
            </div>
          ))}
          {thinking && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '12px 18px', borderRadius: 14, background: '#1a1a25', borderBottomLeftRadius: 4 }}>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {[0,1,2].map(i => <span key={i} style={{
                    width: 8, height: 8, borderRadius: 4, background: 'var(--accent)',
                    animation: `sp 1.2s ease-in-out infinite`, animationDelay: `${i*0.2}s`,
                  }} />)}
                </span>
              </div>
            </div>
          )}
          <style>{`@keyframes sp{0%,100%{transform:scale(0.6);opacity:0.3}50%{transform:scale(1);opacity:1}}`}</style>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 16px 14px', borderTop: '1px solid var(--border)', background: '#0a0a0f' }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask Sophia anything..." disabled={thinking}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: '#12121a', color: 'var(--text)', fontSize: 14, outline: 'none',
            }} />
          <button onClick={send} disabled={thinking || !input.trim()} style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: thinking ? '#2a2a3a' : 'var(--accent)', color: '#fff',
            fontSize: 18, cursor: thinking || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: !input.trim() && !thinking ? 0.5 : 1,
          }}>➤</button>
        </div>
      </div>

      {/* Right: Brain + Reminders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {/* mini tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#12121a', padding: 4, borderRadius: 10, border: '1px solid #2a2a3a' }}>
          {['brain', 'reminders'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none',
              background: view === v ? 'var(--accent)' : 'transparent',
              color: view === v ? '#fff' : 'var(--text-dim)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>{v === 'brain' ? '🧠 Brain' : '⏰ Reminders'}{v === 'reminders' && dueCount > 0 ? ` (${dueCount})` : ''}</button>
          ))}
        </div>

        {/* Brain panel */}
        {view === 'brain' && (
          <div style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
              <input value={brainSearch} onChange={e => setBrainSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchBrain(); }}
                placeholder="Search brain..." style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                  background: '#12121a', color: 'var(--text)', fontSize: 12, outline: 'none',
                }} />
              <button onClick={searchBrain} style={smBtn}>🔍</button>
              <button onClick={embedAll} style={smBtn} title="Generate embeddings for search">⚡</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {(brainResults ? brainResults.results : brainDocs).map(d => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                  borderTop: '1px solid #1a1a25', background: d.pinned ? 'var(--accent)11' : 'transparent',
                }}>
                  <span onClick={() => togglePin(d.id, d.pinned)} style={{
                    cursor: 'pointer', fontSize: 13, opacity: d.pinned ? 1 : 0.3,
                    filter: d.pinned ? 'none' : 'grayscale(1)', transition: 'all 0.2s',
                  }}>📌</span>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.title || 'Untitled'}
                      {d.score !== undefined && <span style={{ color: 'var(--text-dim)', fontSize: 10, marginLeft: 6 }}>{(d.score * 100).toFixed(0)}%</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.content.slice(0, 100)}{d.content.length > 100 ? '...' : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', padding: '2px 5px', background: '#12121a', borderRadius: 4 }}>{d.type}</span>
                  <span onClick={() => deleteDoc(d.id)} style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', opacity: 0.5 }}>✕</span>
                </div>
              ))}
              {brainDocs.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>Your brain is empty. Drop files on the pet to add knowledge.</div>}
            </div>
          </div>
        )}

        {/* Reminders panel */}
        {view === 'reminders' && (
          <div style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>⏰ Reminders</span>
              <button onClick={addReminder} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>+ New</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {dueReminders.length > 0 && (
                <>
                  <div style={{ padding: '4px 14px', fontSize: 10, color: '#f97316', fontWeight: 600 }}>DUE NOW</div>
                  {dueReminders.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f9731611', borderTop: '1px solid #1a1a25' }}>
                      <span style={{ fontSize: 14 }}>🔔</span>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: 'var(--text)' }}>{r.message}</div></div>
                      <button onClick={() => doneReminder(r.id)} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#000', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>Done</button>
                      <span onClick={() => deleteReminder(r.id)} style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', opacity: 0.5 }}>✕</span>
                    </div>
                  ))}
                </>
              )}
              <div style={{ padding: '4px 14px', fontSize: 10, color: 'var(--text-dim)', fontWeight: 600 }}>UPCOMING</div>
              {reminders.filter(r => !dueReminders.find(d => d.id === r.id)).map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderTop: '1px solid #1a1a25' }}>
                  <span style={{ fontSize: 13 }}>⏰</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{r.message}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.due_at}</div>
                  </div>
                  <button onClick={() => doneReminder(r.id)} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: '#12121a', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10 }}>✓</button>
                  <span onClick={() => deleteReminder(r.id)} style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', opacity: 0.5 }}>✕</span>
                </div>
              ))}
              {reminders.length === 0 && dueReminders.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>No reminders. Create one to have Sophia nudge you.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const smBtn = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#12121a', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, lineHeight: 1 };
