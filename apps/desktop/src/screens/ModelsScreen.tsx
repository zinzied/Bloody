import React, { useState } from 'react';
import { usePoll } from '../usePoll';
import { api, type ModelsData, type ModelProvider } from '../api';
import { fmt, price } from '../fmt';

export function ModelsScreen({ enginePort }: { enginePort: number | null }) {
  const { data, error, reload } = usePoll(() => api.models(), 5000);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [task, setTask] = useState('coding');

  if (!data && !error) {
    return <div className="spinner"><span className="spinner-frame">⠋</span>Loading models…</div>;
  }
  if (error) return <div className="error-line">{error}</div>;

  const providers = data as ModelsData;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Models</h1>
        <p className="page-subtitle">Model catalog, recommendations, and cost projections</p>
      </header>

      <section className="section">
        <h2 className="section-title">Provider Catalog</h2>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ marginRight: '12px', fontSize: '13px', color: 'var(--color-dim)' }}>
            Filter: <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              style={{ marginLeft: '8px', padding: '6px 10px', background: 'var(--color-bg-elevated)', color: 'var(--color-fg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
            >
              <option value="">All Providers</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
            </select>
          </label>
        </div>

        {providers.map((provider) => {
          if (selectedProvider && provider.id !== selectedProvider) return null;
          return (
            <div key={provider.id} style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '12px' }}>
                {provider.name} ({provider.id}) {provider.configured && <span className="badge ok" style={{ fontSize: '10px', marginLeft: '8px' }}>Configured</span>}
              </h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Context</th>
                      <th>Tools</th>
                      <th>Reasoning</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provider.models?.map((m, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{m.name}</td>
                        <td>{fmt(m.context)}</td>
                        <td>{m.tool_call ? '✓' : '—'}</td>
                        <td>{m.reasoning ? '✓' : '—'}</td>
                        <td>{price(m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <section className="section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="flex gap-2 flex-wrap">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Task:
            <select
              value={task}
              onChange={(e) => setTask(e.target.value)}
              style={{ padding: '6px 10px', background: 'var(--color-bg-elevated)', color: 'var(--color-fg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
            >
              <option value="coding">Coding</option>
              <option value="chat">Chat</option>
              <option value="analysis">Analysis</option>
              <option value="creative">Creative</option>
            </select>
          </label>
          <button className="badge ok" style={{ cursor: 'pointer' }}>Get Recommendation</button>
          <button className="badge" style={{ cursor: 'pointer' }}>Choose Saver Models</button>
          <button className="badge" style={{ cursor: 'pointer' }}>Cost Projection</button>
          <button className="badge" style={{ cursor: 'pointer' }}>Heatmap</button>
        </div>
        <div className="hint mt-2">
          Full model recommendation, chooser, projection, and heatmap functionality will call the backend API endpoints.
        </div>
      </section>

      <div className="flex justify-between mt-4">
        <button onClick={reload} className="badge ok" style={{ cursor: 'pointer' }}>↻ Refresh</button>
      </div>
    </div>
  );
}