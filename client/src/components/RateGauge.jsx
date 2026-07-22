import { useState, useEffect } from 'react';
import { fetchRateLimits } from '../lib/api.js';

const PROVIDER_COLORS = {
  openai: '#22c55e',
  anthropic: '#f97316',
  gemini: '#3b82f6',
  openrouter: '#a855f7',
  ollama: '#eab308',
  lmstudio: '#ef4444',
};

export function RateGauge({ provider, models, liveData, usage }) {
  const [limits, setLimits] = useState(liveData || null);
  const color = PROVIDER_COLORS[provider] || '#6366f1';

  useEffect(() => {
    if (!liveData) {
      fetchRateLimits(provider).then(setLimits);
    } else {
      setLimits(liveData);
    }
  }, [provider, liveData]);

  const rpmPercent = limits?.rpm_limit && limits?.rpm_remaining != null
    ? ((limits.rpm_limit - limits.rpm_remaining) / limits.rpm_limit) * 100
    : null;

  const tpmPercent = limits?.tpm_limit && limits?.tpm_remaining != null
    ? ((limits.tpm_limit - limits.tpm_remaining) / limits.tpm_limit) * 100
    : null;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ ...styles.dot, background: color }} />
        <h3 style={styles.title}>{provider}</h3>
        {!limits?.configured && <span style={styles.badge}>Not configured</span>}
      </div>

      {rpmPercent !== null && (
        <div style={styles.gaugeSection}>
          <div style={styles.gaugeLabel}>
            <span>RPM</span>
            <span>{limits.rpm_remaining}/{limits.rpm_limit}</span>
          </div>
          <GaugeBar percent={rpmPercent} color={color} />
        </div>
      )}

      {tpmPercent !== null && (
        <div style={styles.gaugeSection}>
          <div style={styles.gaugeLabel}>
            <span>TPM</span>
            <span>{formatNum(limits.tpm_remaining)}/{formatNum(limits.tpm_limit)}</span>
          </div>
          <GaugeBar percent={tpmPercent} color={color} />
        </div>
      )}

      {rpmPercent === null && tpmPercent === null && limits?.configured && (
        <p style={styles.dim}>Rate limits not available from API</p>
      )}

      {usage && (
        <div style={styles.usageRow}>
          <span style={styles.usageStat}>${(usage.cost || 0).toFixed(4)} today</span>
          <span style={styles.usageStat}>{formatNum(usage.tokens || 0)} tokens</span>
          <span style={styles.usageStat}>{usage.requests || 0} reqs</span>
        </div>
      )}

      <div style={styles.modelList}>
        {models.slice(0, 4).map(m => (
          <span key={m.id} style={styles.modelTag}>{m.name}</span>
        ))}
        {models.length > 4 && <span style={styles.moreTag}>+{models.length - 4}</span>}
      </div>
    </div>
  );
}

function GaugeBar({ percent, color }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const gaugeColor = clamped > 90 ? '#ef4444' : clamped > 70 ? '#eab308' : color;

  return (
    <div style={styles.gaugeTrack}>
      <div style={{ ...styles.gaugeFill, width: `${clamped}%`, background: gaugeColor }} />
      <div style={{ ...styles.gaugeMarker, left: `${clamped}%` }} />
    </div>
  );
}

function formatNum(n) {
  if (n == null) return '?';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

const styles = {
  card: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20 },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 10, height: 10, borderRadius: '50%' },
  title: { fontSize: 15, fontWeight: 600, textTransform: 'capitalize', flex: 1 },
  badge: { fontSize: 11, padding: '2px 8px', background: '#2a2a3a', borderRadius: 6, color: '#8888a0' },
  gaugeSection: { marginBottom: 12 },
  gaugeLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8888a0', marginBottom: 4 },
  gaugeTrack: { position: 'relative', height: 8, background: '#1a1a25', borderRadius: 4, overflow: 'visible' },
  gaugeFill: { height: '100%', borderRadius: 4, transition: 'width 0.5s ease, background 0.3s ease' },
  gaugeMarker: { position: 'absolute', top: -3, width: 2, height: 14, background: '#fff', borderRadius: 1, transition: 'left 0.5s ease', transform: 'translateX(-1px)' },
  usageRow: { display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' },
  usageStat: { fontSize: 12, color: '#8888a0' },
  modelList: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12 },
  modelTag: { fontSize: 11, padding: '2px 8px', background: '#1a1a25', borderRadius: 6, color: '#8888a0' },
  moreTag: { fontSize: 11, padding: '2px 8px', background: '#2a2a3a', borderRadius: 6, color: '#6366f1' },
  dim: { fontSize: 12, color: '#8888a0' },
};
