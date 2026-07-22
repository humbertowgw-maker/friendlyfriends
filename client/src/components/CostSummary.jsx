export function CostSummary({ today, month }) {
  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Cost Summary</h3>
      <div style={styles.row}>
        <div style={styles.block}>
          <div style={styles.label}>Today</div>
          <div style={styles.value}>${(today?.cost_today || 0).toFixed(4)}</div>
        </div>
        <div style={styles.block}>
          <div style={styles.label}>30 Days</div>
          <div style={styles.value}>${(month?.cost_month || 0).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20 },
  title: { fontSize: 14, fontWeight: 600, marginBottom: 12 },
  row: { display: 'flex', gap: 24 },
  block: { flex: 1 },
  label: { fontSize: 12, color: '#8888a0' },
  value: { fontSize: 24, fontWeight: 700, marginTop: 4 },
};
