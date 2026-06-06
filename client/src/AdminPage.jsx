import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './api.js';

export default function AdminPage({ user }) {
  const [users,   setUsers]   = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ur, sr] = await Promise.all([
        apiFetch('/api/admin/users'),
        apiFetch('/api/admin/stats'),
      ]);
      if (!ur.ok) { setError('Not authorized'); setLoading(false); return; }
      setUsers(await ur.json());
      setStats(await sr.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteUser(u) {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    setDeleting(u.id);
    try {
      const r = await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      if (!r.ok) { alert((await r.json()).error); }
      else await load();
    } finally {
      setDeleting(null);
    }
  }

  async function toggleAdmin(u) {
    try {
      await apiFetch(`/api/admin/users/${u.id}/admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !u.isAdmin }),
      });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)', fontSize: 13 }}>Loading…</div>;
  if (error)   return <div style={{ padding: 40, color: 'var(--danger)', fontSize: 13 }}>{error}</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Admin dashboard</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24 }}>Manage users and view system health.</p>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 28 }}>
          {[
            { label: 'Total users',     val: stats.userCount },
            { label: 'Admins',          val: stats.adminCount },
            { label: 'Saved keys (all)', val: stats.integrationRows },
            { label: 'Uptime (s)',       val: stats.uptime },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--surface)', border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '12px 14px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 500 }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Users table */}
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
              {['ID', 'Username', 'Email', 'Keys', 'Joined', 'Role', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{u.id}</td>
                <td style={{ padding: '9px 12px', fontWeight: 500 }}>
                  {u.username}
                  {u.id === user.id && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', background: 'rgba(29,158,117,.1)', padding: '1px 5px', borderRadius: 8 }}>you</span>}
                </td>
                <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{u.email ?? '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '2px 8px', fontSize: 12 }}>
                    {u.integrationCount}
                  </span>
                </td>
                <td style={{ padding: '9px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmt(u.createdAt)}</td>
                <td style={{ padding: '9px 12px' }}>
                  <button
                    onClick={() => u.id !== user.id && toggleAdmin(u)}
                    disabled={u.id === user.id}
                    title={u.id === user.id ? 'Cannot change your own role' : (u.isAdmin ? 'Remove admin' : 'Make admin')}
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, cursor: u.id === user.id ? 'default' : 'pointer',
                      background: u.isAdmin ? 'rgba(29,158,117,.1)' : 'var(--bg)',
                      border: `0.5px solid ${u.isAdmin ? 'var(--accent)' : 'var(--border)'}`,
                      color: u.isAdmin ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {u.isAdmin ? 'Admin' : 'User'}
                  </button>
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                  {u.id !== user.id && (
                    <button
                      onClick={() => deleteUser(u)}
                      disabled={deleting === u.id}
                      style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
                    >
                      {deleting === u.id ? '…' : 'Delete'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
        Node {stats?.nodeVersion} · server uptime {Math.floor((stats?.uptime ?? 0) / 60)}m
      </p>
    </div>
  );
}
