import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { modelsApi } from '../services/api';
import DiagnosisCard from '../components/DiagnosisCard';

const HEALTH_COLOR = { healthy: '#22c55e', warning: '#f59e0b', critical: '#ef4444', unknown: '#8b8fa8' };

export default function ModelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [model, setModel]     = useState(null);
  const [keys, setKeys]       = useState([]);
  const [newKey, setNewKey]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      modelsApi.get(id),
      modelsApi.listKeys(id),
    ]).then(([modelRes, keysRes]) => {
      setModel(modelRes.data.data);
      setKeys(keysRes.data.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const generateKey = async () => {
    const { data } = await modelsApi.generateKey(id, { label: 'New key' });
    setNewKey(data.api_key);
    const keysRes = await modelsApi.listKeys(id);
    setKeys(keysRes.data.data);
  };

  const revokeKey = async (keyId) => {
    await modelsApi.revokeKey(id, keyId);
    setKeys(keys.filter(k => k.id !== keyId));
  };

  if (loading) return (
    <div style={{ textAlign: 'center', color: 'var(--mp-muted)', padding: 80 }}>Loading...</div>
  );
  if (!model) return (
    <div style={{ textAlign: 'center', color: 'var(--mp-muted)', padding: 80 }}>Model not found</div>
  );

  const health = model.last_health || 'unknown';
  const hColor = HEALTH_COLOR[health];

  return (
    <div>
      <button onClick={() => navigate('/dashboard')} style={{
        background: 'none', border: 'none', color: 'var(--mp-muted)',
        cursor: 'pointer', fontSize: 13, marginBottom: 24, padding: 0,
      }}>
        ← Back to dashboard
      </button>

      {/* Model header */}
      <div style={{
        background: 'var(--mp-surface)', border: '1px solid var(--mp-border)',
        borderRadius: 16, padding: 28, marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{model.name}</h1>
          <p style={{ color: 'var(--mp-muted)', fontSize: 14, marginTop: 6, marginBottom: 16 }}>
            {model.description || 'No description'}
          </p>
          <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--mp-muted)' }}>
            <span>Type: <strong style={{ color: 'var(--mp-text)' }}>{model.task_type}</strong></span>
            <span>Created: <strong style={{ color: 'var(--mp-text)' }}>{new Date(model.created_at).toLocaleDateString()}</strong></span>
            <span>Features: <strong style={{ color: 'var(--mp-text)' }}>{Object.keys(model.feature_schema || {}).length}</strong></span>
          </div>
        </div>
        <div style={{
          textAlign: 'center', padding: '16px 24px',
          background: `${hColor}18`, borderRadius: 12, border: `1px solid ${hColor}40`,
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: hColor }}>
            {health.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mp-muted)', marginTop: 4 }}>Model health</div>
        </div>
      </div>

      {/* Drift + Diagnosis */}
      <DiagnosisCard modelId={id} />

      {/* API Keys */}
      <div style={{
        background: 'var(--mp-surface)', border: '1px solid var(--mp-border)',
        borderRadius: 16, padding: 28, marginTop: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>API Keys</h2>
            <p style={{ color: 'var(--mp-muted)', fontSize: 13, marginTop: 4 }}>
              Use these keys with the ModelPulse Python SDK
            </p>
          </div>
          <button onClick={generateKey} style={{
            padding: '8px 16px', background: 'var(--mp-primary)', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Generate key
          </button>
        </div>

        {newKey && (
          <div style={{
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginBottom: 6 }}>
              ✓ New API key — copy it now, it won't be shown again
            </div>
            <code style={{ fontSize: 13, color: 'var(--mp-text)', wordBreak: 'break-all' }}>
              {newKey}
            </code>
          </div>
        )}

        {keys.length === 0 ? (
          <div style={{ color: 'var(--mp-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
            No API keys yet
          </div>
        ) : (
          keys.map(k => (
            <div key={k.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0', borderBottom: '1px solid var(--mp-border)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{k.label}</div>
                <div style={{ fontSize: 12, color: 'var(--mp-muted)', marginTop: 2 }}>
                  {k.key_prefix}... · Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                </div>
              </div>
              <button onClick={() => revokeKey(k.id)} style={{
                padding: '5px 12px', background: 'rgba(239,68,68,0.1)',
                color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6, fontSize: 12, cursor: 'pointer',
              }}>
                Revoke
              </button>
            </div>
          ))
        )}

        {/* SDK snippet */}
        <div style={{ marginTop: 24, background: 'var(--mp-bg)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--mp-muted)', marginBottom: 10 }}>Quickstart</div>
          <pre style={{ margin: 0, fontSize: 12, color: '#a5b4fc', overflowX: 'auto' }}>{`pip install modelpulse

import modelpulse

modelpulse.init(
    api_key="mp_live_...",
    model_id="${model.id}",
)

@modelpulse.monitor
def predict(features):
    return my_model.predict(features)`}</pre>
        </div>
      </div>
    </div>
  );
}
