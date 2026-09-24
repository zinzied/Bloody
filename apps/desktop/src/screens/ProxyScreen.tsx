import React from 'react';
import { usePoll } from '../usePoll';
import { api, type StatusData } from '../api';
import { fmt, uptime } from '../fmt';

export function ProxyScreen({ enginePort }: { enginePort: number | null }) {
  const { data, error, reload } = usePoll(() => api.status(), 3000);

  if (!data && !error) {
    return <div className="spinner"><span className="spinner-frame">⠋</span>Loading proxy status…</div>;
  }
  if (error) return <div className="error-line">{error}</div>;

  const s = data as StatusData;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Proxy</h1>
        <p className="page-subtitle">Compression proxy status and controls</p>
      </header>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ color: s.running ? 'var(--color-ok)' : 'var(--color-err)' }}>
            {s.running ? 'Running' : 'Stopped'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Port</div>
          <div className="stat-value">{s.port}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Auto-start</div>
          <div className="stat-value">{s.enabled ? 'Enabled' : 'Disabled'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Requests Served</div>
          <div className="stat-value">{fmt(s.requestsServed)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Compression Hits</div>
          <div className="stat-value">{fmt(s.compressionHits)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Bytes Saved</div>
          <div className="stat-value">{fmt(s.totalSavedBytes)}B</div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Details</h2>
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Last Model</div>
            <div className="stat-value">{s.lastModel || '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Last Account</div>
            <div className="stat-value">{s.lastAccount || '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Uptime</div>
            <div className="stat-value">{s.startedAt ? uptime(s.startedAt) : '—'}</div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Proxied Providers</h2>
        {s.proxiedProviders?.length ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Upstream URL</th>
                </tr>
              </thead>
              <tbody>
                {s.proxiedProviders.map((pid, i) => (
                  <tr key={i}>
                    <td>{pid}</td>
                    <td>{s.upstreams?.[pid] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hint">No providers proxied yet. Run <code>token-saver proxy proxify</code> to auto-add configured providers.</div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Actions</h2>
        <div className="flex gap-2 flex-wrap">
          {s.running ? (
            <button onClick={() => { /* TODO: implement stop */ }} className="badge err" style={{ cursor: 'pointer' }}>Stop Proxy</button>
          ) : (
            <button onClick={() => { /* TODO: implement start */ }} className="badge ok" style={{ cursor: 'pointer' }}>Start Proxy</button>
          )}
          <button onClick={() => { /* TODO: implement test */ }} className="badge warn" style={{ cursor: 'pointer' }}>Test Connection</button>
          <button onClick={() => { /* TODO: implement restore */ }} className="badge" style={{ cursor: 'pointer' }}>Restore Direct URLs</button>
          <button onClick={() => { /* TODO: implement proxify */ }} className="badge" style={{ cursor: 'pointer' }}>Proxify All</button>
        </div>
      </section>

      <div className="flex justify-between mt-4">
        <button onClick={reload} className="badge ok" style={{ cursor: 'pointer' }}>↻ Refresh</button>
      </div>
    </div>
  );
}