import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function RegisterPage() {
  const { register, loading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const handle = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (error) clearError();
  };

  const submit = async (e) => {
    e.preventDefault();
    await register(form.name, form.email, form.password);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--mp-bg)',
    }}>
      <div style={{
        width: 400, background: 'var(--mp-surface)',
        border: '1px solid var(--mp-border)', borderRadius: 16, padding: 40,
      }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            <span style={{ color: 'var(--mp-primary)' }}>Model</span>Pulse
          </h1>
          <p style={{ color: 'var(--mp-muted)', fontSize: 14, marginTop: 6 }}>
            Create your account
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', borderRadius: 8, padding: '10px 14px',
            fontSize: 13, marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          {[
            { name: 'name',     label: 'Full name', type: 'text'     },
            { name: 'email',    label: 'Email',     type: 'email'    },
            { name: 'password', label: 'Password',  type: 'password' },
          ].map(({ name, label, type }) => (
            <div key={name} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--mp-muted)', marginBottom: 6 }}>
                {label}
              </label>
              <input
                name={name} type={type} value={form[name]}
                onChange={handle} required
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--mp-border)', background: 'var(--mp-bg)',
                  color: 'var(--mp-text)', fontSize: 14, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px', borderRadius: 8, border: 'none',
            background: loading ? '#4b4ea6' : 'var(--mp-primary)',
            color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8,
          }}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--mp-muted)', marginTop: 24 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--mp-primary)', textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
