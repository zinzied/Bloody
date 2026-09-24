import React from 'react';
import { usePoll } from '../usePoll';
import { api, type ProvidersData } from '../api';
import { fmt } from '../fmt';

export function ProvidersScreen({ enginePort }: { enginePort: number | null }) {
  const { data, error, reload } = usePoll(() => api.providers(), 3000);

  if (!data && !error) {
    return <div className="spinner"><span className="spinner-frame">⠋</span>Loading providers…</div>;
  }
  if (error) return <div className="error-line">{error}</div>;

  const providers = data as ProvidersData;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Providers</h1>
        <p className="page-subtitle">Detected and configured API providers</p>
      </header>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Providers</div>
          <div className="stat-value">{providers.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Configured</div>
          <div className="stat-value">{providers.filter(p => p.configured).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Working</div>
          <div className="stat-value">{providers.filter(p => p.working).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Proxied</div>
          <div className="stat-value">{providers.filter(p => p.proxied).length}</div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Provider List</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Configured</th>
                <th>Working</th>
                <th>Env Detected</th>
                <th>Auth Detected</th>
                <th>In History</th>
                <th>Proxied</th>
                <th>Base URL</th>
                <th>Env Vars</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{p.provider}</td>
                  <td>{p.configured ? '✓' : '—'}</td>
                  <td>{p.working ? '✓' : '—'}</td>
                  <td>{p.envDetected ? '✓' : '—'}</td>
                  <td>{p.authDetected ? '✓' : '—'}</td>
                  <td>{p.inHistory ? '✓' : '—'}</td>
                  <td>{p.proxied ? '✓' : '—'}</td>
                  <td>{p.baseURL || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{p.envVars?.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-between mt-4">
        <button onClick={reload} className="badge ok" style={{ cursor: 'pointer' }}>↻ Refresh</button>
      </div>
    </div>
  );
}