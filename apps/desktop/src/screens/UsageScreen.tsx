import React from 'react';
import { usePoll } from '../usePoll';
import { api, type OverviewData } from '../api';
import { fmt } from '../fmt';

export function UsageScreen({ enginePort }: { enginePort: number | null }) {
  const { data, error, reload } = usePoll(() => api.overview(), 3000);

  if (!data && !error) {
    return <div className="spinner"><span className="spinner-frame">⠋</span>Loading usage…</div>;
  }
  if (error) return <div className="error-line">{error}</div>;

  const p = data as OverviewData;
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Usage</h1>
        <p className="page-subtitle">Savings ledger and proxy history</p>
      </header>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Ledger entries</div>
          <div className="stat-value">{fmt(p.ledger.entries)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Raw tokens</div>
          <div className="stat-value">{fmt(p.ledger.raw_tokens)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tokens saved</div>
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
        <div className="stat-card">
          <div className="stat-label">Proxy bytes saved</div>
          <div className="stat-value">{fmt(p.proxy.saved_bytes)}B</div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">By Kind</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Count</th>
                <th>Tokens Saved</th>
              </tr>
            </thead>
            <tbody>
              {p.byKind?.map((k, i) => (
                <tr key={i}>
                  <td>{k.kind}</td>
                  <td>{fmt(k.count)}</td>
                  <td>{fmt(k.saved_tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">By Model</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Requests</th>
                <th>Tokens Saved</th>
                <th>Bytes Saved</th>
              </tr>
            </thead>
            <tbody>
              {p.perModel?.map((m, i) => (
                <tr key={i}>
                  <td>{m.model}</td>
                  <td>{fmt(m.requests)}</td>
                  <td>{fmt(m.saved_tokens)}</td>
                  <td>{fmt(m.saved_bytes)}B</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Recent Activity</h2>
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
              {p.recent?.slice(0, 20).map((r, i) => (
                <tr key={i}>
                  <td>{new Date(r.ts).toLocaleString()}</td>
                  <td>{r.kind}</td>
                  <td>{r.description}</td>
                  <td>{fmt(r.saved)} {r.unit}</td>
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