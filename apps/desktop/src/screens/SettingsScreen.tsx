import React, { useState } from 'react';
import { usePoll } from '../usePoll';
import { api } from '../api';
import { fmt } from '../fmt';

export function SettingsScreen({ enginePort }: { enginePort: number | null }) {
  const { data, error, reload } = usePoll(() => api.settings.get(), 5000);
  const [model, setModel] = useState('');
  const [smallModel, setSmallModel] = useState('');

  if (!data && !error) {
    return <div className="spinner"><span className="spinner-frame">⠋</span>Loading settings…</div>;
  }
  if (error) return <div className="error-line">{error}</div>;

  const s = data as any;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Current config, compaction, and backups</p>
      </header>

      <section className="section">
        <h2 className="section-title">Current Configuration</h2>
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Config Path</div>
            <div className="stat-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', wordBreak: 'break-all' }}>{s.path || '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Model</div>
            <div className="stat-value">{s.model || '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Small Model</div>
            <div className="stat-value">{s.small_model || '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Current</div>
            <div className="stat-value">{s.current || '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Providers</div>
            <div className="stat-value">{fmt(s.providerCount || 0)} ({s.providers?.join(', ') || '—'})</div>
          </div>
        </div>

        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '12px' }}>Update Models</h3>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Main model (e.g., anthropic/claude-3.5-sonnet)"
              style={{ flex: 1, minWidth: '280px', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px', background: 'var(--color-bg-elevated)', color: 'var(--color-fg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
            />
            <input
              type="text"
              value={smallModel}
              onChange={(e) => setSmallModel(e.target.value)}
              placeholder="Small model (e.g., openai/gpt-4o-mini)"
              style={{ flex: 1, minWidth: '280px', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px', background: 'var(--color-bg-elevated)', color: 'var(--color-fg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
            />
            <button
              onClick={async () => {
                try {
                  await api.settings.save({ model: model || undefined, small_model: smallModel || undefined });
                  reload();
                } catch (e) {
                  alert(String(e));
                }
              }}
              className="badge ok"
              style={{ cursor: 'pointer', padding: '10px 16px' }}
            >
              Save
            </button>
          </div>
        </div>
      </section>

      {s.compaction && (
        <section className="section">
          <h2 className="section-title">Compaction</h2>
          <div className="stats-row">
            {Object.entries(s.compaction).map(([k, v]) => (
              <div key={k} className="stat-card">
                <div className="stat-label">{k}</div>
                <div className="stat-value">{String(v)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.backups?.length && (
        <section className="section">
          <h2 className="section-title">Backups</h2>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Backup</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {s.backups.map(([label, p]: [string, string], i: number) => (
                  <tr key={i}>
                    <td>{label}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex justify-between mt-4">
        <button onClick={reload} className="badge ok" style={{ cursor: 'pointer' }}>↻ Refresh</button>
      </div>
    </div>
  );
}