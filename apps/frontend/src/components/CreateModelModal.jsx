import { useState } from 'react';
import { modelsApi } from '../services/api';

export default function CreateModelModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', task_type: 'classification', description: '', feature_schema_raw: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let feature_schema = {};
      if (form.feature_schema_raw.trim()) {
        // Parse "age:float, income:float, tenure:int" format
        form.feature_schema_raw.split(',').forEach(pair => {
          const [k, v] = pair.trim().split(':');
          if (k) feature_schema[k.trim()] = (v || 'float').trim();
        });
      }
      await modelsApi.create({
        name: form.name,
        task_type: form.task_type,
        description: form.description,
        feature_schema,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create model');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 480, background: 'var(--mp-surface)',
        border: '1px solid var(--mp-border)', borderRadius: 16, padding: 32,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Add model</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--mp-muted)',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        <form onSubmit={submit}>
          {[
            { name: 'name', label: 'Model name', type: 'text', placeholder: 'Churn Predictor v1' },
            { name: 'description', label: 'Description (optional)', type: 'text', placeholder: 'What does this model do?' },
            { name: 'feature_schema_raw', label: 'Features (optional)', type: 'text', placeholder: 'age:float, income:float, tenure:int' },
          ].map(({ name, label, type, placeholder }) => (
            <div key={name} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--mp-muted)', marginBottom: 6 }}>
                {label}
              </label>
              <input
                name={name} type={type} value={form[name]} onChange={handle}
                placeholder={placeholder}
                required={name === 'name'}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--mp-border)', background: 'var(--mp-bg)',
                  color: 'var(--mp-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--mp-muted)', marginBottom: 6 }}>
              Task type
            </label>
            <select name="task_type" value={form.task_type} onChange={handle} style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              border: '1px solid var(--mp-border)', background: 'var(--mp-bg)',
              color: 'var(--mp-text)', fontSize: 14, outline: 'none',
            }}>
              <option value="classification">Classification</option>
              <option value="regression">Regression</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '11px', borderRadius: 8,
              border: '1px solid var(--mp-border)', background: 'transparent',
              color: 'var(--mp-muted)', fontSize: 14, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{
              flex: 1, padding: '11px', borderRadius: 8, border: 'none',
              background: loading ? '#4b4ea6' : 'var(--mp-primary)',
              color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
              {loading ? 'Creating...' : 'Create model'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
