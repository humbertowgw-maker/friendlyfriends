export function Predictions({ predictions }) {
  if (!predictions || predictions.length === 0) return null;

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Usage Predictions</h3>
      {predictions.map((p, i) => (
        <div key={i} style={styles.row}>
          {p.metric === 'daily_cost' && (
            <>
              <div style={styles.label}>Predicted Monthly Cost</div>
              <div style={styles.value}>${(p.predicted_monthly || 0).toFixed(2)}</div>
              <div style={styles.meta}>
                Trend: {p.trend_per_day > 0 ? '+' : ''}{(p.trend_per_day || 0).toFixed(4)}/day &middot; Confidence: {p.confidence}
              </div>
            </>
          )}
          {p.metric === 'peak_usage' && (
            <>
              <div style={styles.label}>Peak Usage Hour</div>
              <div style={styles.value}>{p.peak_hour}:00</div>
              <div style={styles.meta}>
                Off-peak: {p.offpeak_hour}:00 &middot; {Math.round(p.peak_avg_tokens || 0)} tokens/hour avg
              </div>
            </>
          )}
          {p.metric === 'rate_limit_risk' && (
            <>
              <div style={styles.label}>Rate Limit Risk</div>
              <div style={{ ...styles.value, color: p.risk_level === 'high' ? '#ef4444' : '#22c55e' }}>
                {p.risk_level === 'high' ? 'High Risk' : 'Low Risk'}
              </div>
              <div style={styles.meta}>
                ~{Math.round(p.estimated_hours_to_deplete || 0)}h to deplete at current rate
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const styles = {
  card: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20 },
  title: { fontSize: 14, fontWeight: 600, marginBottom: 12 },
  row: { padding: '10px 0', borderBottom: '1px solid #1a1a25' },
  label: { fontSize: 12, color: '#8888a0' },
  value: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  meta: { fontSize: 11, color: '#8888a0', marginTop: 2 },
};
