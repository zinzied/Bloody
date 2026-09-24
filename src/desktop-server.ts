// Headless engine entry for the Tauri desktop app.
// Starts the proxy with control API enabled, prints TOKENSAVER_CONTROL=<port> <token> line
// that the Rust parent parses, and exits cleanly on SIGINT/SIGTERM.

import { start, stop } from './core/proxy.js';

async function main() {
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.split('=')[1]) : undefined;

  try {
    const status = await start(port);
    // The control token + port are printed by initControlApi in proxy.ts
    // (via the control.json handshake file). We also print a clear marker
    // so Rust can detect startup even if control.json is slow on some FS.
    console.log(`TOKENSAVER_CONTROL_STARTED ${status.port}`);
  } catch (e) {
    console.error(`[desktop-server] failed to start: ${(e as Error).message}`);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('[desktop-server] SIGINT received, stopping proxy…');
  await stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[desktop-server] SIGTERM received, stopping proxy…');
  await stop();
  process.exit(0);
});

main();