import { useState, useEffect } from 'react';
import { fetchAlertRules, createAlertRule, deleteAlertRule, fetchAlertHistory } from '../lib/api.js';

const METRICS = [
  { value: 'daily_cost', label: 'Daily Cost ($)' },
  { value: 'daily_tokens', label: 'Daily Tokens' },
  { value: 'cost_usd', label: 'Cost per Request ($)' },
  { value: 'tokens', label: 'Tokens per Request' },
];

export function AlertPanel({ alerts: liveAlerts }) {
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ provider: '*', metric: 'daily_cost', threshold: 10, type: 'warning' });

  useEffect(() => {
    fetchAlertRules().then(setRules);
    fetchAlertHistory().then(setHistory);
  }, []);

  const addRule = async () => {
    await createAlertRule(form);
    setRules(await fetchAlertRules());
    setForm({ ...form, threshold: '' });
  };

  const removeRule = async (id) => {
    await deleteAlertRule(id);
    setRules(await fetchAlertRules());
  };

  const allAlerts = [...liveAlerts, ...history.map(h => ({ ...h, fromHistory: true }))].slice(0, 30);

  return (
    <div>
      <h3 style={styles.title}>Alert Rules</h3>
      <div style={styles.form}>
        <select style={styles.select} value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
          <option value="*">All providers</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <select style={styles.select} value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })}>
          {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input
          style={styles.input}
          type="number"
          placeholder="Threshold"
          value={form.threshold}
          onChange={e => setForm({ ...form, threshold: Number(e.target.value) })}
        />
        <select style={styles.select} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <button style={styles.addBtn} onClick={addRule}>Add Rule</button>
      </div>

      {rules.length > 0 && (
        <div style={styles.rulesList}>
          {rules.map(r => (
            <div key={r.id} style={styles.rule}>
              <span style={styles.ruleText}>
                {r.provider === '*' ? 'All' : r.provider} &middot; {r.metric} &gt; {r.threshold} ({r.type})
              </span>
              <button style={styles.removeBtn} onClick={() => removeRule(r.id)}>x</button>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ ...styles.title, marginTop: 24 }}>Recent Alerts</h3>
      {allAlerts.length === 0 ? (
        <p style={styles.dim}>No alerts yet</p>
      ) : (
        <div style={styles.alertList}>
          {allAlerts.map((a, i) => (
            <div key={i} style={{ ...styles.alertItem, borderLeftColor: a.type === 'critical' ? '#ef4444' : '#eab308' }}>
              <div style={styles.alertMsg}>{a.message}</div>
              <div style={styles.alertTime}>{a.timestamp}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  title: { fontSize: 14, fontWeight: 600, marginBottom: 12 },
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  select: { padding: '6px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12 },
  input: { padding: '6px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12, width: 100 },
  addBtn: { padding: '6px 14px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' },
  rulesList: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 },
  rule: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#1a1a25', borderRadius: 8 },
  ruleText: { fontSize: 12, color: '#e4e4ef' },
  removeBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 },
  alertList: { display: 'flex', flexDirection: 'column', gap: 6 },
  alertItem: { padding: '10px 12px', background: '#1a1a25', borderRadius: 8, borderLeft: '3px solid' },
  alertMsg: { fontSize: 13 },
  alertTime: { fontSize: 11, color: '#8888a0', marginTop: 4 },
  dim: { fontSize: 13, color: '#8888a0' },
};
