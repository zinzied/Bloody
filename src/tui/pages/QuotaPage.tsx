import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { Page, Section, Row, Stat, Table, Hint, ErrorLine, Badge, fmt, countdown, T, Meter, Spinner } from '../components.js';
import { useData } from '../useData.js';
import { useScreenInput, type KeyEvent } from '../input.js';
import { quotaSummary } from '../../core/insights.js';
import { setLimitDecision } from '../../core/budget.js';

export function QuotaPage() {
  const { data, error, reload } = useData(() => quotaSummary(), 3000);
  const budget = data?.budget as Record<string, any> | null | undefined;
  const budgetDaily = data?.budgetDaily as Record<string, any> | null | undefined;
  const budgetStatus = data?.budgetStatus as Record<string, any> | null | undefined;
  const quota = data?.quota as Record<string, any> | null | undefined;
  const providers = Object.entries(quota?.providers || {});
  const accounts = Object.entries(quota?.accounts || {});
  const limitReached = Boolean(budgetStatus?.limitReached);
  const choiceRequired = Boolean(budgetStatus?.choiceRequired);
  const decision = (budgetStatus?.decision?.choice as string | null) || null;

  // Daily limits never block the proxy: the user picks reset (keep configured model)
  // or stay blocked (opt in to the free-model guard for today).
  const onKey = useCallback(
    (k: KeyEvent) => {
      if (!limitReached) return false;
      if (k.input === 'r') {
        setLimitDecision('reset');
        reload();
        return true;
      }
      if (k.input === 'b') {
        setLimitDecision('blocked');
        reload();
        return true;
      }
      return false;
    },
    [limitReached, reload]
  );
  useScreenInput(onKey);

  return (
    <Page title="Quota" sub="Provider quota tracker and per-task budget (live — refreshes every 3s).">
      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <Spinner label="Loading quota…" />}
      {data && (
        <>
          {/* Daily limit prompt — the proxy is never blocked until the user answers */}
          {choiceRequired && (
            <Section title="Daily limit reached — choose what happens next">
              <Text color="yellow">{String(budgetStatus?.reason || 'Daily limit reached')}</Text>
              <Box marginTop={1} flexDirection="column">
                <Text>
                  <Text bold color="green">[r]</Text> Reset counters — keep using your configured model (never blocks the proxy)
                </Text>
                <Text>
                  <Text bold color="red">[b]</Text> Stay blocked — keep the free-model guard for today (
                  {String(budgetStatus?.fallbackModel || 'free model')})
                </Text>
              </Box>
              <Hint>Nothing is blocked meanwhile — requests keep flowing to your configured model.</Hint>
            </Section>
          )}
          {limitReached && decision === 'blocked' && (
            <Hint>Blocked by your choice — press `r` after re-opening this page or run `token-saver budget reset` to switch back.</Hint>
          )}
          {/* Daily budget guard (user-controlled) */}
          {budgetStatus ? (
            <>
              <Section title="Daily Budget — user-controlled guard">
                <Row>
                  <Stat label="Policy mode" value={(budgetStatus.policy as any)?.mode || '—'} />
                  <Stat
                    label="Daily budget $"
                    value={`$${Number((budgetStatus.policy as any)?.daily_budget_usd ?? 0).toFixed(2)}`}
                  />
                  <Stat
                    label="Spent today"
                    value={`$${Number((budgetStatus as any).spentUSD ?? 0).toFixed(4)}`}
                    sub={`${fmt((budgetStatus as any).spentTokens ?? 0)} tok · ${fmt((budgetStatus as any).daily?.requests ?? 0)} req`}
                  />
                  <Stat
                    label="Remaining $"
                    value={`$${Number((budgetStatus as any).remainingUSD ?? 0).toFixed(4)}`}
                    color={Number((budgetStatus as any).remainingUSD) <= 0 ? 'red' : 'green'}
                  />
                  <Stat
                    label="Free tokens left"
                    value={fmt((budgetStatus as any).remainingTokens)}
                    sub={`limit ${fmt((budgetStatus as any).policy?.free_daily_token_limit)}`}
                  />
                </Row>
                <Row>
                  <Meter
                    value={Number((budgetStatus as any).spentUSD ?? 0)}
                    max={Number((budgetStatus.policy as any)?.daily_budget_usd ?? 1)}
                    label="Budget utilization"
                    cols={35}
                    suffix="of daily"
                  />
                </Row>
                <Box marginTop={1} flexDirection="row">
                  {budgetStatus?.blockingActive ? (
                    <Badge ok={false}> BLOCKED BY YOUR CHOICE — free-model guard: {String(budgetStatus.fallbackModel || '—')} </Badge>
                  ) : limitReached ? (
                    <Badge ok={false}> LIMIT REACHED — NOT blocking; press r (reset) or b (stay blocked) </Badge>
                  ) : (
                    <Badge ok={true}> Budget OK — requests use configured model </Badge>
                  )}
                  <Text> </Text>
                  <Text color="gray">{budgetStatus?.reason || 'No limit hit'}</Text>
                </Box>
                {budgetDaily && (
                  <Hint>
                    Daily state: {(budgetDaily as any).date} · tokens {fmt((budgetDaily as any).tokensTotal)} (in{' '}
                    {fmt((budgetDaily as any).tokensIn)} + out {fmt((budgetDaily as any).tokensOut)}) · last{' '}
                    {(budgetDaily as any).lastUpdated ? new Date((budgetDaily as any).lastUpdated).toLocaleString() : '—'}
                  </Hint>
                )}
              </Section>
            </>
          ) : null}
          {budget ? (
            <>
              <Row>
                <Stat label="Task" value={budget.task || '—'} sub={`${fmt(budget.task_tokens ?? 0)} tokens`} />
                <Stat label="Budget limit" value={fmt(budget.budget_limit)} />
                <Stat label="Total allocated" value={fmt(budget.total_allocated)} />
                <Stat
                  label="Remaining"
                  value={`${fmt(budget.remaining)} ${budget.remaining > 0 ? '' : '(used up)'}`}
                />
              </Row>
              <Row>
                <Meter
                  value={Number(budget.total_allocated ?? 0)}
                  max={Number(budget.budget_limit ?? 1)}
                  label="Task budget allocated"
                  cols={35}
                  suffix="of limit"
                />
              </Row>
              <Section title="Allocation">
                <Row>
                  {Object.entries(budget.allocation || {}).map(([k, v]) => (
                    <Stat key={k} label={k.replace(/_/g, ' ')} value={fmt(v)} />
                  ))}
                </Row>
              </Section>
            </>
          ) : (
            <Hint>No budget.json yet — it appears once a task budget is created.</Hint>
          )}
          <Section title="Providers">
            {providers.length ? (
              <Table
                head={['Provider', 'Total quota', 'Remaining', 'Status', 'Cost', 'Last checked']}
                rows={providers.map(([pid, p]) => [
                  T(pid),
                  T(fmt((p as any).total_quota)),
                  T(fmt((p as any).remaining), Number((p as any).remaining) <= 0 ? 'red' : 'green'),
                  T(
                    (p as any).rate_limited_until
                      ? countdown((p as any).rate_limited_until)
                      : (p as any).reset_at
                      ? countdown((p as any).reset_at)
                      : '—',
                    (p as any).rate_limited_until ? 'red' : undefined
                  ),
                  T(
                    (p as any).total_cost !== undefined
                      ? `$${Number((p as any).total_cost).toFixed(4)} (${(p as any).request_count || 0} req)`
                      : '—'
                  ),
                  T((p as any).last_checked ? new Date((p as any).last_checked).toLocaleString() : '—'),
                ])}
              />
            ) : (
              <Hint>No provider quotas tracked yet — they appear once requests flow through the proxy.</Hint>
            )}
          </Section>
          <Section title="Accounts">
            {accounts.length ? (
              <Table
                head={['Account', 'Remaining', 'Status', 'Last used']}
                rows={accounts.map(([id, a]) => [
                  T(id),
                  T(fmt((a as any).remaining)),
                  T(
                    (a as any).rate_limited_until ? countdown((a as any).rate_limited_until) : 'ok',
                    (a as any).rate_limited_until ? 'red' : 'green'
                  ),
                  T((a as any).last_used ? new Date((a as any).last_used).toLocaleString() : '—'),
                ])}
              />
            ) : (
              <Hint>No account quotas tracked yet.</Hint>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
