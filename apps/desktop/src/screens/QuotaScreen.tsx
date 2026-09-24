import React from 'react';
import { usePoll } from '../usePoll';
import { api, type QuotaData } from '../api';
import { fmt, countdown } from '../fmt';

export function QuotaScreen({ enginePort }: { enginePort: number | null }) {
  const { data, error, reload } = usePoll(() => api.quota(), 3000);

  if (!data && !error) {
    return <div className="spinner"><span className="spinner-frame">⠋</span>Loading quota…</div>;
  }
  if (error) return <div className="error-line">{error}</div>;

  const q = data as QuotaData;
  const budgetStatus = q.budgetStatus;
  const budgetDaily = q.budgetDaily;
  const providers = Object.entries(q.quota?.providers || {});
  const accounts = Object.entries(q.quota?.accounts || {});

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Quota</h1>
        <p className="page-subtitle">Provider quota tracker and per-task budget</p>
      </header>

      {budgetStatus && (
        <>
          <section className="section">
            <h2 className="section-title">Daily Budget — Auto-Fallback Guard</h2>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">Policy Mode</div>
                <div className="stat-value">{budgetStatus.policy?.mode || '—'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Daily Budget $</div>
                <div className="stat-value">${Number(budgetStatus.policy?.daily_budget_usd || 0).toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Spent Today</div>
                <div className="stat-value">${Number(budgetStatus.spentUSD || 0).toFixed(4)}</div>
                <div className="stat-sub">{fmt(budgetStatus.spentTokens || 0)} tok · {fmt(budgetStatus.daily?.requests || 0)} req</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Remaining $</div>
                <div className="stat-value ${Number(budgetStatus.remainingUSD || 0) <= 0 ? 'text-red-500' : 'text-green-500'}">${Number(budgetStatus.remainingUSD || 0).toFixed(4)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Free Tokens Left</div>
                <div className="stat-value">{fmt(budgetStatus.remainingTokens || 0)}</div>
                <div className="stat-sub">limit {fmt(budgetStatus.policy?.free_daily_token_limit || 0)}</div>
              </div>
            </div>

            <div className="meter mt-2">
              <div className="meter-label">
                <span>Budget Utilization</span>
                <span>${Number(budgetStatus.spentUSD || 0).toFixed(4)} / ${Number(budgetStatus.policy?.daily_budget_usd || 1).toFixed(2)}</span>
              </div>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{
                    width: `${Math.min(100, (Number(budgetStatus.spentUSD || 0) / Math.max(1, Number(budgetStatus.policy?.daily_budget_usd || 1))) * 100)}%`,
                    background: Number(budgetStatus.spentUSD || 0) / Math.max(1, Number(budgetStatus.policy?.daily_budget_usd || 1)) >= 0.85
                      ? 'var(--color-err)'
                      : Number(budgetStatus.spentUSD || 0) / Math.max(1, Number(budgetStatus.policy?.daily_budget_usd || 1)) >= 0.6
                        ? 'var(--color-section)'
                        : 'var(--color-ok)'
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              {budgetStatus.exceeded ? (
                <span className="badge err"> EXCEEDED — Auto-routing to: {budgetStatus.fallbackModel || '—'} </span>
              ) : (
                <span className="badge ok"> Budget OK — Using configured model </span>
              )}
              <span style={{ color: 'var(--color-dim)', fontSize: '12px' }}>{budgetStatus.reason || 'No limit hit'}</span>
            </div>

            {budgetDaily && (
              <div className="hint mt-2">
                Daily state: {budgetDaily.date} · tokens {fmt(budgetDaily.tokensTotal)} (in {fmt(budgetDaily.tokensIn)} + out {fmt(budgetDaily.tokensOut)}) · last {budgetDaily.lastUpdated ? new Date(budgetDaily.lastUpdated).toLocaleString() : '—'}
              </div>
            )}
          </section>
        </>
      )}

      {q.budget && (
        <>
          <section className="section">
            <h2 className="section-title">Task Budget</h2>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">Task</div>
                <div className="stat-value">{q.budget?.task || '—'}</div>
                <div className="stat-sub">{fmt(q.budget?.task_tokens || 0)} tokens</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Budget Limit</div>
                <div className="stat-value">{fmt(q.budget?.budget_limit || 0)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Allocated</div>
                <div className="stat-value">{fmt(q.budget?.total_allocated || 0)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Remaining</div>
                <div className="stat-value ${(q.budget?.remaining || 0) <= 0 ? 'text-red-500' : ''}">{fmt(q.budget?.remaining || 0)} {(q.budget?.remaining || 0) <= 0 ? '(used up)' : ''}</div>
              </div>
            </div>

            <div className="meter mt-2">
              <div className="meter-label">
                <span>Task Budget Allocated</span>
                <span>{fmt(q.budget?.total_allocated || 0)} / {fmt(q.budget?.budget_limit || 1)}</span>
              </div>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{
                    width: `${Math.min(100, (Number(q.budget?.total_allocated || 0) / Math.max(1, Number(q.budget?.budget_limit || 1))) * 100)}%`,
                    background: Number(q.budget?.total_allocated || 0) / Math.max(1, Number(q.budget?.budget_limit || 1)) >= 0.85
                      ? 'var(--color-err)'
                      : Number(q.budget?.total_allocated || 0) / Math.max(1, Number(q.budget?.budget_limit || 1)) >= 0.6
                        ? 'var(--color-section)'
                        : 'var(--color-ok)'
                  }}
                />
              </div>
            </div>

            <section className="section">
              <h2 className="section-title">Allocation</h2>
              <div className="stats-row">
                {Object.entries(q.budget?.allocation || {}).map(([k, v]) => (
                  <div key={k} className="stat-card">
                    <div className="stat-label">{k.replace(/_/g, ' ')}</div>
                    <div className="stat-value">{fmt(v)}</div>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </>
      )}

      <section className="section">
        <h2 className="section-title">Providers</h2>
        {providers.length ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Total Quota</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th>Cost</th>
                  <th>Last Checked</th>
                </tr>
              </thead>
              <tbody>
                {providers.map(([pid, p], i) => (
                  <tr key={i}>
                    <td>{pid}</td>
                    <td>{fmt(p.total_quota)}</td>
                    <td style={{ color: (p.remaining || 0) <= 0 ? 'var(--color-err)' : 'var(--color-ok)' }}>{fmt(p.remaining || 0)}</td>
                    <td style={{ color: p.rate_limited_until ? 'var(--color-err)' : 'var(--color-dim)' }}>
                      {p.rate_limited_until ? countdown(p.rate_limited_until) : p.reset_at ? countdown(p.reset_at) : '—'}
                    </td>
                    <td>{p.total_cost !== undefined ? `$${Number(p.total_cost).toFixed(4)} (${p.request_count || 0} req)` : '—'}</td>
                    <td>{p.last_checked ? new Date(p.last_checked).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hint">No provider quotas tracked yet — they appear once requests flow through the proxy.</div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Accounts</h2>
        {accounts.length ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(([id, a], i) => (
                  <tr key={i}>
                    <td>{id}</td>
                    <td>{fmt(a.remaining || 0)}</td>
                    <td style={{ color: a.rate_limited_until ? 'var(--color-err)' : 'var(--color-ok)' }}>
                      {a.rate_limited_until ? countdown(a.rate_limited_until) : 'ok'}
                    </td>
                    <td>{a.last_used ? new Date(a.last_used).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hint">No account quotas tracked yet.</div>
        )}
      </section>

      <div className="flex justify-between mt-4">
        <button onClick={reload} className="badge ok" style={{ cursor: 'pointer' }}>↻ Refresh</button>
      </div>
    </div>
  );
}