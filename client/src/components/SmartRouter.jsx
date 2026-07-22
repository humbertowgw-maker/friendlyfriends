import { useState, useEffect } from 'react';
import { fetchRouterRecommendation } from '../lib/api.js';

const TASK_TYPES = ['general', 'cost-sensitive', 'speed', 'quality'];

export function SmartRouter({ full }) {
  const [taskType, setTaskType] = useState('general');
  const [rec, setRec] = useState(null);

  useEffect(() => {
    fetchRouterRecommendation(taskType).then(setRec);
  }, [taskType]);

  return (
    <div>
      <div style={styles.header}>
        <h3 style={styles.title}>Smart Model Router</h3>
        <div style={styles.taskButtons}>
          {TASK_TYPES.map(t => (
            <button
              key={t}
              style={{ ...styles.btn, ...(taskType === t ? styles.btnActive : {}) }}
              onClick={() => setTaskType(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {!rec?.recommendation ? (
        <p style={styles.dim}>{rec?.message || 'No routing data available yet'}</p>
      ) : (
        <div>
          <div style={styles.bestModel}>
            <div style={styles.bestLabel}>Best model for "{taskType}"</div>
            <div style={styles.bestName}>{rec.recommendation.model}</div>
            <div style={styles.bestMeta}>
              {rec.recommendation.provider} &middot;
              ${(rec.recommendation.cost_per_token * 1000).toFixed(4)}/1K tokens &middot;
              {rec.recommendation.avg_latency?.toFixed(0)}ms avg
            </div>
          </div>

          {full && rec.alternatives?.length > 0 && (
            <div style={styles.alternatives}>
              <div style={styles.altTitle}>Alternatives</div>
              {rec.alternatives.map((a, i) => (
                <div key={i} style={styles.altRow}>
                  <span style={styles.altName}>{a.model}</span>
                  <span style={styles.altMeta}>
                    {a.provider} &middot;
                    ${(a.cost_per_token * 1000).toFixed(4)}/1K &middot;
                    {a.avg_latency?.toFixed(0)}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 14, fontWeight: 600 },
  taskButtons: { display: 'flex', gap: 4 },
  btn: { padding: '4px 10px', border: '1px solid #2a2a3a', borderRadius: 6, background: 'transparent', color: '#8888a0', cursor: 'pointer', fontSize: 12 },
  btnActive: { background: '#6366f1', color: '#fff', border: '1px solid #6366f1' },
  dim: { fontSize: 13, color: '#8888a0', textAlign: 'center', padding: 20 },
  bestModel: { padding: 16, background: '#1a1a25', borderRadius: 10, borderLeft: '3px solid #22c55e' },
  bestLabel: { fontSize: 12, color: '#8888a0', marginBottom: 4 },
  bestName: { fontSize: 18, fontWeight: 700 },
  bestMeta: { fontSize: 12, color: '#8888a0', marginTop: 4 },
  alternatives: { marginTop: 12 },
  altTitle: { fontSize: 12, color: '#8888a0', marginBottom: 8 },
  altRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#1a1a25', borderRadius: 8, marginBottom: 4 },
  altName: { fontSize: 13, fontWeight: 500 },
  altMeta: { fontSize: 12, color: '#8888a0' },
};
