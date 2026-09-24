import React from 'react';
import { usePoll } from '../usePoll';
import { api, type OverviewData } from '../api';
import { fmt } from '../fmt';

export function OverviewScreen({ enginePort }: { enginePort: number | null }) {
  const { data, error, reload } = usePoll(() => api.overview(), 3000);

  if (!data && !error) {
    return <div className="spinner"><span className="spinner-frame">⠋</span>Loading overview…</div>;
  }
  if (error) return <div className="error-line">{error}</div>;

  const p = data as OverviewData;
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">Reduce token waste and spending when using AI coding models</p>
      </header>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Ledger entries</div>
          <div className="stat-value">{fmt(p.ledger.entries)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ledger tokens saved</div>
          <div className="stat-value">{fmt(p.ledger.saved_tokens)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Proxy requests</div>
          <div className="stat-value">{fmt(p.proxy.requests)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Proxy tokens saved</div>
          <div className="stat-value">{fmt(p.proxy.saved_tokens)}</div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Recent Activity</h2>
        {p.recent?.length ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Kind</th>
                  <th>Description</th>
                  <th>Saved</th>
                </tr>
              </thead>
              <tbody>
                {p.recent.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td>{new Date(r.ts).toLocaleTimeString()}</td>
                    <td>{r.kind}</td>
                    <td>{r.description}</td>
                    <td>{fmt(r.saved)} {r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hint">No recent activity yet — start the proxy and make some requests.</div>
        )}
      </section>

      <div className="flex justify-between mt-4">
        <button onClick={reload} className="badge ok" style={{ cursor: 'pointer' }}>↻ Refresh</button>
        <span style={{ fontSize: '11px', color: 'var(--color-dim)' }}>Auto-refreshes every 3s</span>
      </div>
    </div>
  );
}