import React from 'react';
import { usePoll } from '../usePoll';
import { api, type RoutingData } from '../api';
import { fmt } from '../fmt';

export function RoutingScreen({ enginePort }: { enginePort: number | null }) {
  const { data, error, reload } = usePoll(() => api.routing(), 3000);

  if (!data && !error) {
    return <div className="spinner"><span className="spinner-frame">⠋</span>Loading routing…</div>;
  }
  if (error) return <div className="error-line">{error}</div>;

  const r = data as RoutingData;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Routing</h1>
        <p className="page-subtitle">Current model, tiers, fallback chains, and account routing</p>
      </header>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Current Model</div>
          <div className="stat-value">{r.currentModel || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Upstream</div>
          <div className="stat-value">{r.upstream ? `${r.upstream.url} (via ${r.upstream.pid})` : 'Direct (no proxy)'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Provider Tier</div>
          <div className="stat-value">{r.tier || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Accounts</div>
          <div className="stat-value">{r.accounts?.length || 0}</div>
          <div className="stat-sub">strategy: {r.accountStrategy || 'round-robin'}</div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Tiered Fallback Chain</h2>
        {r.tieredChain?.length ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Provider</th></tr>
              </thead>
              <tbody>
                {r.tieredChain.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{p}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hint">No tiered chain configured.</div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Per-Model Fallback Chain</h2>
        {r.fallbackChain?.length ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Fallback Model</th></tr>
              </thead>
              <tbody>
                {r.fallbackChain.map((m, i) => <tr key={i}><td>{i + 1}</td><td>{m}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hint">No fallback chain.</div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Provider Routing</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Provider</th><th>Configured</th><th>Proxied</th><th>Base URL</th></tr>
            </thead>
            <tbody>
              {r.routing?.map((x, i) => (
                <tr key={i}>
                  <td>{x.provider}</td>
                  <td>{x.configured ? '✓' : '—'}</td>
                  <td>{x.proxied ? '✓' : '—'}</td>
                  <td>{x.baseURL || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Upstreams</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Provider</th><th>Upstream URL</th></tr>
            </thead>
            <tbody>
              {Object.entries(r.upstreams || {}).map(([pid, url], i) => (
                <tr key={i}><td>{pid}</td><td>{url}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Accounts</h2>
        {r.accounts?.length ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Provider</th><th>Status</th><th>Priority</th></tr>
              </thead>
              <tbody>
                {r.accounts.map((a, i) => (
                  <tr key={i}><td>{a.id}</td><td>{a.provider}</td><td>{a.status}</td><td>{fmt(a.priority)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hint">No accounts configured.</div>
        )}
      </section>

      <div className="flex justify-between mt-4">
        <button onClick={reload} className="badge ok" style={{ cursor: 'pointer' }}>↻ Refresh</button>
      </div>
    </div>
  );
}