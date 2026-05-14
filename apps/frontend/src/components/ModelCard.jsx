const HEALTH_CONFIG = {
  healthy:  { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  label: 'Healthy'  },
  warning:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Warning'  },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  label: 'Critical' },
  unknown:  { color: '#8b8fa8', bg: 'rgba(139,143,168,0.1)',label: 'No data'  },
};

export default function ModelCard({ model, onClick }) {
  const health = HEALTH_CONFIG[model.last_health || 'unknown'];

  return (
    <div onClick={onClick} style={{
      background: 'var(--mp-surface)', border: '1px solid var(--mp-border)',
      borderRadius: 12, padding: 24, cursor: 'pointer', transition: 'border-color .15s',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--mp-primary)'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--mp-border)'}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{model.name}</h3>
          <span style={{ fontSize: 11, color: 'var(--mp-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {model.task_type}
          </span>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
          color: health.color, background: health.bg,
        }}>
          {health.label}
        </span>
      </div>

      {/* Description */}
      {model.description && (
        <p style={{ fontSize: 13, color: 'var(--mp-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          {model.description}
        </p>
      )}

      {/* Features */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {Object.keys(model.feature_schema || {}).slice(0, 4).map(f => (
          <span key={f} style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 4,
            background: 'rgba(99,102,241,0.1)', color: 'var(--mp-primary)',
          }}>
            {f}
          </span>
        ))}
        {Object.keys(model.feature_schema || {}).length > 4 && (
          <span style={{ fontSize: 11, color: 'var(--mp-muted)', padding: '3px 4px' }}>
            +{Object.keys(model.feature_schema).length - 4} more
          </span>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--mp-muted)' }}>
        <span>Created {new Date(model.created_at).toLocaleDateString()}</span>
        <span style={{
          color: model.status === 'active' ? '#22c55e' : 'var(--mp-muted)',
          textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, fontSize: 11,
        }}>
          {model.status}
        </span>
      </div>
    </div>
  );
}
