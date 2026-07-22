import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchDailyCosts } from '../lib/api.js';

export function CostChart() {
  const [data, setData] = useState([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchDailyCosts(days).then(raw => {
      const byDate = {};
      for (const row of raw) {
        if (!byDate[row.day]) byDate[row.day] = { day: row.day };
        byDate[row.day][row.provider] = row.total_cost;
        byDate[row.day][`${row.provider}_tokens`] = row.total_tokens;
      }
      setData(Object.values(byDate).sort((a, b) => a.day.localeCompare(b.day)));
    });
  }, [days]);

  return (
    <div>
      <div style={styles.header}>
        <h3 style={styles.title}>Cost Over Time</h3>
        <div style={styles.buttons}>
          {[7, 14, 30, 90].map(d => (
            <button
              key={d}
              style={{ ...styles.btn, ...(days === d ? styles.btnActive : {}) }}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <p style={styles.dim}>No cost data yet. Start making API calls to see trends.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
            <XAxis
              dataKey="day"
              tick={{ fill: '#8888a0', fontSize: 11 }}
              tickFormatter={d => d.slice(5)}
            />
            <YAxis
              tick={{ fill: '#8888a0', fontSize: 11 }}
              tickFormatter={v => `$${v.toFixed(2)}`}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#e4e4ef' }}
              formatter={(value) => [`$${Number(value).toFixed(4)}`, undefined]}
            />
            <Area type="monotone" dataKey="openai" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
            <Area type="monotone" dataKey="anthropic" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.2} />
            <Area type="monotone" dataKey="gemini" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
            <Area type="monotone" dataKey="openrouter" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} />
            <Area type="monotone" dataKey="ollama" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 14, fontWeight: 600 },
  buttons: { display: 'flex', gap: 4 },
  btn: { padding: '4px 10px', border: '1px solid #2a2a3a', borderRadius: 6, background: 'transparent', color: '#8888a0', cursor: 'pointer', fontSize: 12 },
  btnActive: { background: '#6366f1', color: '#fff', border: '1px solid #6366f1' },
  dim: { fontSize: 13, color: '#8888a0', textAlign: 'center', padding: 40 },
};
