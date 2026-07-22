import { useState, useEffect } from 'react';
import { fetchDashboard, fetchProviders, createEventSource } from './lib/api.js';
import { RateGauge } from './components/RateGauge.jsx';
import { CostSummary } from './components/CostSummary.jsx';
import { CostChart } from './components/CostChart.jsx';
import { SmartRouter } from './components/SmartRouter.jsx';
import { AlertPanel } from './components/AlertPanel.jsx';
import { Predictions } from './components/Predictions.jsx';
import { ProviderSetup } from './components/ProviderSetup.jsx';
import { InventoryPanel } from './components/InventoryPanel.jsx';

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [providers, setProviders] = useState([]);
  const [liveLimits, setLiveLimits] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    Promise.all([fetchDashboard(), fetchProviders()])
      .then(([d, p]) => { setDashboard(d); setProviders(p); setLoading(false); })
      .catch(() => setLoading(false));

    const sse = createEventSource();
    sse.addEventListener('rate-limit', (e) => {
      const data = JSON.parse(e.data);
      setLiveLimits(prev => ({ ...prev, [data.provider]: data }));
    });
    sse.addEventListener('alert', (e) => {
      const data = JSON.parse(e.data);
      setAlerts(prev => [data, ...prev].slice(0, 20));
    });
    sse.addEventListener('usage', () => {
      fetchDashboard().then(setDashboard);
    });

    const interval = setInterval(() => {
      fetchDashboard().then(setDashboard);
    }, 15000);

    return () => { sse.close(); clearInterval(interval); };
  }, []);

  if (loading) return <div style={styles.loading}>Loading AI Rate Gauge...</div>;
  if (!dashboard) return <div style={styles.loading}>Failed to connect to server</div>;

  const configuredProviders = providers.filter(p => p.configured);
  const unconfiguredProviders = providers.filter(p => !p.configured);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>AI Rate Gauge</h1>
          <p style={styles.subtitle}>Self-aware cost & rate limit monitoring</p>
        </div>
        <div style={styles.tabs}>
          {['overview', 'costs', 'routing', 'alerts', 'inventory'].map(t => (
            <button
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {unconfiguredProviders.length > 0 && (
        <ProviderSetup providers={unconfiguredProviders} />
      )}

      {tab === 'overview' && (
        <div style={styles.grid}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Today</h3>
            <div style={styles.statRow}>
              <Stat label="Cost" value={`$${(dashboard.today.cost_today || 0).toFixed(4)}`} />
              <Stat label="Tokens" value={formatNum(dashboard.today.tokens_today || 0)} />
              <Stat label="Requests" value={dashboard.today.requests_today || 0} />
            </div>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Last 30 Days</h3>
            <div style={styles.statRow}>
              <Stat label="Cost" value={`$${(dashboard.month.cost_month || 0).toFixed(2)}`} />
              <Stat label="Tokens" value={formatNum(dashboard.month.tokens_month || 0)} />
              <Stat label="Requests" value={formatNum(dashboard.month.requests_month || 0)} />
            </div>
          </div>

          {configuredProviders.map(p => (
            <RateGauge
              key={p.name}
              provider={p.name}
              models={p.models}
              liveData={liveLimits[p.name]}
              usage={dashboard.byProvider.find(u => u.provider === p.name)}
            />
          ))}

          <Predictions predictions={dashboard.predictions} />
          <SmartRouter />
        </div>
      )}

      {tab === 'costs' && (
        <div style={styles.grid}>
          <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
            <CostChart />
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Cost by Provider</h3>
            {dashboard.byProvider.length === 0 && <p style={styles.dim}>No usage data yet</p>}
            {dashboard.byProvider.map(p => (
              <div key={p.provider} style={styles.costRow}>
                <span style={styles.costLabel}>{p.provider}</span>
                <span style={styles.costValue}>${(p.cost || 0).toFixed(4)}</span>
              </div>
            ))}
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Optimization Suggestions</h3>
            {dashboard.suggestions.length === 0 && <p style={styles.dim}>Using models efficiently</p>}
            {dashboard.suggestions.map((s, i) => (
              <div key={i} style={styles.suggestion}>{s.message}</div>
            ))}
          </div>
        </div>
      )}

      {tab === 'routing' && (
        <div style={styles.grid}>
          <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
            <SmartRouter full />
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <div style={styles.grid}>
          <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
            <AlertPanel alerts={alerts} />
          </div>
        </div>
      )}

      {tab === 'inventory' && (
        <div style={styles.grid}>
          <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
            <InventoryPanel />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

const styles = {
  app: { maxWidth: 1200, margin: '0 auto', padding: '20px' },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 18, color: '#8888a0' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' },
  subtitle: { fontSize: 13, color: '#8888a0' },
  tabs: { display: 'flex', gap: 4, background: '#12121a', padding: 4, borderRadius: 10, border: '1px solid #2a2a3a' },
  tab: { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#8888a0', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  tabActive: { background: '#6366f1', color: '#fff' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 },
  card: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20 },
  cardTitle: { fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#e4e4ef' },
  statRow: { display: 'flex', justifyContent: 'space-around', gap: 16 },
  statValue: { fontSize: 22, fontWeight: 700, color: '#e4e4ef' },
  statLabel: { fontSize: 12, color: '#8888a0', marginTop: 4 },
  dim: { color: '#8888a0', fontSize: 13 },
  costRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a25' },
  costLabel: { fontSize: 13, textTransform: 'capitalize' },
  costValue: { fontSize: 13, fontWeight: 600 },
  suggestion: { padding: '10px 12px', background: '#1a1a25', borderRadius: 8, marginBottom: 8, fontSize: 13, borderLeft: '3px solid #6366f1' },
};
