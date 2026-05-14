import { useEffect, useState } from 'react';
import api from '../services/api';

const HEALTH_COLOR = { healthy: '#22c55e', warning: '#f59e0b', critical: '#ef4444' };
const HEALTH_BG    = { healthy: 'rgba(34,197,94,0.08)', warning: 'rgba(245,158,11,0.08)', critical: 'rgba(239,68,68,0.08)' };

export default function DiagnosisCard({ modelId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get(`/models/${modelId}/snapshots`)
      .then(res => setSnapshot(res.data.data?.[0] || null))
      .catch(() => setSnapshot(null))
      .finally(() => setLoading(false));
  }, [modelId]);

  if (loading) return (
    <div style={{
      background: 'var(--mp-surface)', border: '1px solid var(--mp-border)',
      borderRadius: 16, padding: 28,
    }}>
      <div style={{ color: 'var(--mp-muted)', fontSize: 13 }}>Loading drift data...</div>
    </div>
  );

  if (!snapshot) return (
    <div style={{
      background: 'var(--mp-surface)', border: '1px solid var(--mp-border)',
      borderRadius: 16, padding: 28,
    }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Drift Analysis</h2>
      <p style={{ color: 'var(--mp-muted)', fontSize: 13, margin: 0 }}>
        No drift snapshots yet. The system will compute drift automatically after 85+ predictions.
        You can also trigger it manually via <code style={{ color: 'var(--mp-primary)' }}>POST /dev/run-drift</code>.
      </p>
    </div>
  );

  const health = snapshot.overall_health;
  const hColor = HEALTH_COLOR[health] || '#8b8fa8';
  const hBg    = HEALTH_BG[health]    || 'rgba(139,143,168,0.08)';
  const featureDrift = snapshot.feature_drift || {};

  return (
    <div style={{
      background: 'var(--mp-surface)', border: `1px solid ${hColor}40`,
      borderRadius: 16, padding: 28,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Latest Drift Snapshot</h2>
          <div style={{ fontSize: 12, color: 'var(--mp-muted)', marginTop: 4 }}>
            Computed {new Date(snapshot.computed_at).toLocaleString()} ·{' '}
            {snapshot.prediction_count} predictions analysed
          </div>
        </div>
        <span style={{
          padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
          color: hColor, background: hBg,
        }}>
          {health?.toUpperCase()}
        </span>
      </div>

      {/* AI Diagnosis */}
      {snapshot.ai_diagnosis && (
        <div style={{
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 10, padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: 'var(--mp-primary)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            ✦ AI Diagnosis
          </div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--mp-text)', lineHeight: 1.6 }}>
            {snapshot.ai_diagnosis}
          </p>
        </div>
      )}

      {/* Feature drift table */}
      {Object.keys(featureDrift).length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mp-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Feature drift scores
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(featureDrift).map(([feature, scores]) => {
              const psi     = scores?.psi ?? 0;
              const drifted = scores?.drifted;
              const barW    = Math.min(100, (psi / 0.4) * 100);
              const barColor = psi > 0.20 ? '#ef4444' : psi > 0.10 ? '#f59e0b' : '#22c55e';

              return (
                <div key={feature} style={{
                  display: 'grid', gridTemplateColumns: '120px 1fr 80px 70px',
                  alignItems: 'center', gap: 12, padding: '8px 0',
                  borderBottom: '1px solid var(--mp-border)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{feature}</div>
                  <div style={{ background: 'var(--mp-border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${barW}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width .3s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mp-muted)', textAlign: 'right' }}>
                    PSI {psi.toFixed(3)}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, textAlign: 'center', padding: '2px 8px', borderRadius: 10,
                    color: drifted ? '#ef4444' : '#22c55e',
                    background: drifted ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                  }}>
                    {drifted ? 'DRIFTED' : 'OK'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prediction drift */}
      {snapshot.prediction_drift && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--mp-bg)', borderRadius: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--mp-muted)' }}>Prediction distribution drift: </span>
          <strong style={{ color: snapshot.prediction_drift.drifted ? '#ef4444' : '#22c55e' }}>
            PSI {(snapshot.prediction_drift.psi || 0).toFixed(3)} — {snapshot.prediction_drift.drifted ? 'DRIFTED' : 'Stable'}
          </strong>
        </div>
      )}
    </div>
  );
}
