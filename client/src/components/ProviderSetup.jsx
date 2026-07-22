export function ProviderSetup({ providers }) {
  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Configure Your Providers</h3>
      <p style={styles.desc}>Add your API keys to .env in the project root, then restart the server.</p>
      <div style={styles.list}>
        {providers.map(p => (
          <div key={p.name} style={styles.row}>
            <span style={styles.name}>{p.name}</span>
            <span style={styles.status}>Not configured</span>
          </div>
        ))}
      </div>
      <div style={styles.codeBlock}>
        <code style={styles.code}>
{`# Add to .env:
${providers.map(p => {
  const key = p.name === 'openrouter' ? 'OPENROUTER_API_KEY'
    : p.name === 'gemini' ? 'GOOGLE_GEMINI_API_KEY'
    : p.name === 'anthropic' ? 'ANTHROPIC_API_KEY'
    : p.name.toUpperCase() + '_API_KEY';
  return `${key}=your-key-here`;
}).join('\n')}`}
        </code>
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20, marginBottom: 16 },
  title: { fontSize: 14, fontWeight: 600, marginBottom: 8 },
  desc: { fontSize: 12, color: '#8888a0', marginBottom: 12 },
  list: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#1a1a25', borderRadius: 8 },
  name: { fontSize: 13, textTransform: 'capitalize' },
  status: { fontSize: 11, color: '#eab308' },
  codeBlock: { background: '#0a0a0f', borderRadius: 8, padding: 12, overflow: 'auto' },
  code: { fontSize: 12, color: '#22c55e', whiteSpace: 'pre' },
};
