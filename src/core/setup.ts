import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as proxy from './proxy.js';
import { ensureDir } from './config.js';

function appRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function ensureBuild(root: string): boolean {
  const entry = path.join(root, 'dist', 'index.js');
  if (fs.existsSync(entry)) return true;
  const res = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit', shell: false });
  return res.status === 0 && fs.existsSync(entry);
}

function writeVbs(root: string, nodePath: string): string {
  const vbsPath = path.join(root, 'scripts', 'start-watchdog.vbs');
  ensureDir(path.dirname(vbsPath));
  const content = `Set sh = CreateObject("WScript.Shell")\r\nsh.CurrentDirectory = "${root.replace(/"/g, '""')}"\r\nsh.Run """${nodePath.replace(/"/g, '""')}"" ""${path.join(root, 'scripts', 'watchdog.mjs').replace(/"/g, '""')}""", 0, False\r\n`;
  fs.writeFileSync(vbsPath, content, 'utf-8');
  return vbsPath;
}

function installWindows(root: string, nodePath: string): string[] {
  const logs: string[] = [];
  const vbs = writeVbs(root, nodePath);
  logs.push(`vbs: ${vbs}`);
  const startup = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  ensureDir(startup);
  // A machine that ran setup before the rename still has the old shortcut there,
  // and two autostart entries mean two watchdogs fighting over the same port.
  for (const stale of ['TokenSaver Proxy.lnk', 'TokenSaver Proxy.bat']) {
    try {
      fs.rmSync(path.join(startup, stale), { force: true });
    } catch {}
  }
  const lnk = path.join(startup, 'NoBleed Proxy.lnk');
  const ps = `$sh=New-Object -COM WScript.Shell;$lnk=$sh.CreateShortcut('${lnk.replace(/'/g, "''")}');$lnk.TargetPath='C:\\Windows\\System32\\wscript.exe';$lnk.Arguments='//B //Nologo "${vbs.replace(/"/g, '""')}"';$lnk.WorkingDirectory='${root.replace(/'/g, "''")}';$lnk.WindowStyle=7;$lnk.Description='NoBleed proxy watchdog';$lnk.Save()`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
  if (r.status === 0 && fs.existsSync(lnk)) logs.push(`autostart: ${lnk}`);
  else {
    const bat = path.join(startup, 'NoBleed Proxy.bat');
    fs.writeFileSync(bat, `@echo off\r\nwscript //B //Nologo "${vbs}"\r\n`, 'utf-8');
    logs.push(`autostart (fallback bat): ${bat}`);
  }
  return logs;
}

function installMac(root: string, nodePath: string): string[] {
  const logs: string[] = [];
  const dir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  ensureDir(dir);
  // Removed before the new plist is written: launchd was loading both, and the
  // old one would keep spawning a second watchdog.
  const stalePlist = path.join(dir, 'com.tokensaver.proxy.plist');
  if (fs.existsSync(stalePlist)) {
    spawnSync('launchctl', ['unload', stalePlist], { stdio: 'ignore' });
    try {
      fs.rmSync(stalePlist, { force: true });
    } catch {}
  }
  const plist = path.join(dir, 'com.nobleed.proxy.plist');
  const watchdog = path.join(root, 'scripts', 'watchdog.mjs');
  const logOut = path.join(os.homedir(), '.config', 'opencode', 'compress', 'watchdog.log');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>com.nobleed.proxy</string>\n<key>ProgramArguments</key><array><string>${nodePath}</string><string>${watchdog}</string></array>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n<key>StandardOutPath</key><string>${logOut}</string>\n<key>StandardErrorPath</key><string>${logOut}</string>\n</dict></plist>\n`;
  fs.writeFileSync(plist, xml, 'utf-8');
  logs.push(`plist: ${plist}`);
  spawnSync('launchctl', ['unload', plist], { stdio: 'ignore' });
  const r = spawnSync('launchctl', ['load', '-w', plist], { stdio: 'pipe' });
  if (r.status === 0) logs.push('launchctl: loaded');
  else logs.push(`launchctl: ${String(r.stderr || r.stdout || '').trim() || 'manual load needed: launchctl load -w ' + plist}`);
  return logs;
}

function installLinux(root: string, nodePath: string): string[] {
  const logs: string[] = [];
  const watchdog = path.join(root, 'scripts', 'watchdog.mjs');
  const autostartDir = path.join(os.homedir(), '.config', 'autostart');
  ensureDir(autostartDir);
  // The stale desktop entry is dropped first so a machine that ran setup before
  // the rename does not autostart two watchdogs.
  try {
    fs.rmSync(path.join(autostartDir, 'tokensaver-proxy.desktop'), { force: true });
  } catch {}
  const desktop = path.join(autostartDir, 'nobleed-proxy.desktop');
  fs.writeFileSync(desktop, `[Desktop Entry]\nType=Application\nName=NoBleed Proxy\nExec=${nodePath} ${watchdog}\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n`, 'utf-8');
  logs.push(`autostart: ${desktop}`);
  const sysDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  ensureDir(sysDir);
  const staleUnit = path.join(sysDir, 'tokensaver-proxy.service');
  if (fs.existsSync(staleUnit)) {
    spawnSync('systemctl', ['--user', 'disable', '--now', 'tokensaver-proxy.service'], { stdio: 'ignore' });
    try {
      fs.rmSync(staleUnit, { force: true });
    } catch {}
  }
  const svc = path.join(sysDir, 'nobleed-proxy.service');
  fs.writeFileSync(svc, `[Unit]\nDescription=NoBleed Proxy Watchdog\nAfter=network.target\n[Service]\nExecStart=${nodePath} ${watchdog}\nRestart=always\nRestartSec=3\n[Install]\nWantedBy=default.target\n`, 'utf-8');
  logs.push(`systemd: ${svc}`);
  const hasSystemctl = spawnSync('which', ['systemctl'], { stdio: 'ignore' }).status === 0 || spawnSync('command', ['-v', 'systemctl'], { stdio: 'ignore', shell: true }).status === 0;
  if (hasSystemctl) {
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
    const r = spawnSync('systemctl', ['--user', 'enable', '--now', 'nobleed-proxy.service'], { stdio: 'pipe' });
    if (r.status === 0) logs.push('systemd: enabled --now');
    else logs.push(`systemd: enable failed — ${String(r.stderr || '').trim().slice(0, 200)}`);
  }
  return logs;
}

function startWatchdogNow(root: string, nodePath: string): void {
  const watchdog = path.join(root, 'scripts', 'watchdog.mjs');
  if (os.platform() === 'win32') {
    const vbs = path.join(root, 'scripts', 'start-watchdog.vbs');
    spawn('wscript.exe', ['//B', '//Nologo', vbs], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else {
    spawn(nodePath, [watchdog], { detached: true, stdio: 'ignore' }).unref();
  }
}

export async function runSetup(opts: { port?: number; noAutostart?: boolean } = {}): Promise<string[]> {
  const out: string[] = [];
  const root = appRoot();
  const nodePath = process.execPath;
  const port = opts.port;

  if (!ensureBuild(root)) out.push('build: failed — run `npm run build` manually');
  else out.push('build: ok');

  // OpenCode Zen rejects requests that do not come from the OpenCode client
  // ("free tier can only be used from within OpenCode"), so a proxied copy of
  // the `opencode` provider can only ever fail. Proxifying it again on every
  // setup run also undid a deliberate `proxy stop`/unproxy.
  const NOT_PROXYABLE = new Set(['opencode']);
  try {
    const r = proxy.ensureProxiedProviders(port, true, [...NOT_PROXYABLE]);
    if (r.rewritten.length) out.push(`proxified: ${r.rewritten.join(', ')}`);
    else if (r.added.length) out.push(`proxified: ${r.added.join(', ')}`);
    else out.push('proxified: already');
    const skipped = r.skipped.filter((p) => NOT_PROXYABLE.has(p));
    if (skipped.length) out.push(`skipped (client-locked upstream): ${skipped.join(', ')}`);
  } catch (e) {
    out.push(`proxify: ${(e as Error).message}`);
  }

  try {
    proxy.enable(true, port);
    out.push('auto-start: enabled');
  } catch (e) {
    out.push(`auto-start: ${(e as Error).message}`);
  }

  if (!opts.noAutostart) {
    try {
      const p = os.platform();
      let logs: string[] = [];
      if (p === 'win32') logs = installWindows(root, nodePath);
      else if (p === 'darwin') logs = installMac(root, nodePath);
      else logs = installLinux(root, nodePath);
      out.push(...logs);
    } catch (e) {
      out.push(`autostart: ${(e as Error).message}`);
    }
  } else out.push('autostart: skipped (--no-autostart)');

  try {
    const s = await proxy.start(port);
    out.push(`proxy: http://127.0.0.1:${s.port} ${s.running ? 'running' : 'adopted'}`);
  } catch (e) {
    out.push(`proxy: ${(e as Error).message}`);
  }

  try {
    startWatchdogNow(root, nodePath);
    out.push('watchdog: started');
  } catch (e) {
    out.push(`watchdog: ${(e as Error).message}`);
  }

  out.push('done — restart opencode to use the proxy');
  return out;
}
