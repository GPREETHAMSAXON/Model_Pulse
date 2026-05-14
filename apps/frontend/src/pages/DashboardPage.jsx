import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { modelsApi } from '../services/api';
import ModelCard from '../components/ModelCard';
import CreateModelModal from '../components/CreateModelModal';

export default function DashboardPage() {
  const [models, setModels]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const fetchModels = async () => {
    try {
      const { data } = await modelsApi.list();
      setModels(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchModels(); }, []);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Models</h1>
          <p style={{ color: 'var(--mp-muted)', fontSize: 14, marginTop: 6 }}>
            Monitor your ML models in production
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          padding: '10px 20px', background: 'var(--mp-primary)', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          + Add model
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total models',    value: models.length },
          { label: 'Active',          value: models.filter(m => m.status === 'active').length },
          { label: 'Need attention',  value: models.filter(m => m.status === 'active').length },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: 'var(--mp-surface)', border: '1px solid var(--mp-border)',
            borderRadius: 12, padding: '20px 24px',
          }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 13, color: 'var(--mp-muted)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Models grid */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--mp-muted)', padding: 60 }}>
          Loading models...
        </div>
      ) : models.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 80, background: 'var(--mp-surface)',
          border: '1px dashed var(--mp-border)', borderRadius: 16,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⬡</div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>No models yet</h3>
          <p style={{ color: 'var(--mp-muted)', fontSize: 14, marginTop: 8 }}>
            Add your first model to start monitoring
          </p>
          <button onClick={() => setShowModal(true)} style={{
            marginTop: 20, padding: '10px 24px', background: 'var(--mp-primary)',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 14,
            fontWeight: 600, cursor: 'pointer',
          }}>
            Add first model
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onClick={() => navigate(`/models/${model.id}`)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreateModelModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); fetchModels(); }}
        />
      )}
    </div>
  );
}
