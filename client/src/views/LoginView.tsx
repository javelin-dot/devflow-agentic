import { useState } from 'react';
import { useLogin } from '../api/hooks';

export function LoginView({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useLogin();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    login.mutate({ username, password }, {
      onSuccess: () => onLogin(),
      onError: (err) => setError(err.message),
    });
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>
      <div style={{
        width: 360, padding: 32, background: 'var(--bg-secondary)',
        borderRadius: 12, border: '1px solid var(--border-default)',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>DevFlow</h2>
        <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 13 }}>
          首次启动默认账号：<code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 3 }}>local-admin / local-admin</code>
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>用户名</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 14,
              }}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 14,
              }}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--accent-red)', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={login.isPending || !username || !password}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 6, border: 'none',
              background: login.isPending ? 'var(--text-tertiary)' : 'var(--accent-blue)',
              color: 'var(--text-inverse)', cursor: login.isPending ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600,
            }}
          >
            {login.isPending ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
