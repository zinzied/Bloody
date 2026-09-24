import React, { useState, useEffect, useCallback } from 'react';
import { OverviewScreen } from './screens/OverviewScreen';
import { UsageScreen } from './screens/UsageScreen';
import { QuotaScreen } from './screens/QuotaScreen';
import { CompressScreen } from './screens/CompressScreen';
import { ProxyScreen } from './screens/ProxyScreen';
import { RoutingScreen } from './screens/RoutingScreen';
import { ProvidersScreen } from './screens/ProvidersScreen';
import { ModelsScreen } from './screens/ModelsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export const NAV = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'usage', label: 'Usage', icon: '📈' },
  { id: 'quota', label: 'Quota', icon: '📦' },
  { id: 'compress', label: 'Compress', icon: '🗜️' },
  { id: 'proxy', label: 'Proxy', icon: '🔌' },
  { id: 'routing', label: 'Routing', icon: '🛣️' },
  { id: 'providers', label: 'Providers', icon: '🔑' },
  { id: 'models', label: 'Models', icon: '🤖' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
] as const;

type NavId = (typeof NAV)[number]['id'];

interface ScreenProps {
  enginePort: number | null;
}

const ScreenComponents: Record<NavId, React.FC<ScreenProps>> = {
  overview: OverviewScreen,
  usage: UsageScreen,
  quota: QuotaScreen,
  compress: CompressScreen,
  proxy: ProxyScreen,
  routing: RoutingScreen,
  providers: ProvidersScreen,
  models: ModelsScreen,
  settings: SettingsScreen,
};

export function App() {
  const [active, setActive] = useState<NavId>('overview');
  const [engineReady, setEngineReady] = useState(false);
  const [enginePort, setEnginePort] = useState<number | null>(null);

  // Listen for engine ready event from Rust
  useEffect(() => {
    const handleReady = (e: CustomEvent) => {
      setEngineReady(true);
      setEnginePort(e.detail.port);
    };
    window.addEventListener('engine-ready', handleReady as EventListener);
    return () => window.removeEventListener('engine-ready', handleReady as EventListener);
  }, []);

  const navigate = useCallback((id: NavId) => {
    setActive(id);
  }, []);

  if (!engineReady) {
    return (
      <div className="app-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner">
            <span className="spinner-frame">⠋</span>
            <span>Starting engine on port {enginePort ?? '…'}</span>
          </div>
          <p className="hint" style={{ marginTop: '16px' }}>
            The Bloody token-saver proxy is starting up…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" role="navigation" aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="sidebar-title">Bloody</span>
          <span className="sidebar-version">v10.0.0</span>
        </div>
        <nav>
          <ul className="nav-list" role="list">
            {NAV.map((item) => (
              <li key={item.id} role="none">
                <button
                  className={`nav-item ${active === item.id ? 'active' : ''}`}
                  onClick={() => navigate(item.id)}
                  aria-current={active === item.id ? 'page' : undefined}
                  aria-label={item.label}
                >
                  <span className="nav-bullet" aria-hidden="true" />
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="main-content" role="main">
        {(() => {
          const Comp = ScreenComponents[active];
          return Comp ? <Comp enginePort={enginePort} /> : null;
        })()}
      </main>
    </div>
  );
}