use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_tungstenite::connect_async;
use futures_util::{SinkExt, StreamExt};
use url::Url;

#[derive(Debug, Serialize, Deserialize)]
struct ControlInfo {
    port: u16,
    token: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct WsFrame {
    topic: String,
    ts: u64,
    payload: serde_json::Value,
}

struct AppState {
    engine_child: std::sync::Mutex<Option<std::process::Child>>,
    control_port: std::sync::Mutex<Option<u16>>,
    control_token: std::sync::Mutex<Option<String>>,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_websocket::init())
        .manage(AppState {
            engine_child: std::sync::Mutex::new(None),
            control_port: std::sync::Mutex::new(None),
            control_token: std::sync::Mutex::new(None),
        })
        .system_tray(build_tray())
        .on_system_tray_event(handle_tray_event)
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_engine_and_ws(app_handle).await;
            });
            Ok(())
        })
        .on_window_event(handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_tray() -> SystemTray {
    let menu = SystemTrayMenu::new()
        .add_item(SystemTrayMenuItem::new("show", "Show Dashboard"))
        .add_item(SystemTrayMenuItem::new("toggle_proxy", "Toggle Proxy"))
        .add_item(SystemTrayMenuItem::new("reset_budget", "Reset Daily Budget"))
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(SystemTrayMenuItem::new("quit", "Quit"));
    SystemTray::new().with_menu(menu).with_tooltip("Bloody Token Saver")
}

fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    if let SystemTrayEvent::MenuItemClick { id, .. } = event {
        match id.as_str() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "toggle_proxy" => {
                app.emit("toggle-proxy", ()).ok();
            }
            "reset_budget" => {
                app.emit("reset-budget", ()).ok();
            }
            "quit" => {
                if let Some(child) = app.state::<AppState>().engine_child.lock().unwrap().take() {
                    let _ = kill_child_gracefully(child);
                }
                std::process::exit(0);
            }
            _ => {}
        }
    }
}

fn handle_window_event(event: WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        event.window().hide().ok();
        api.prevent_close();
    }
}

async fn start_engine_and_ws(app: AppHandle) {
    // Start the Node engine
    let engine_path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("../../../dist/desktop-server.js")))
        .unwrap_or_else(|| std::path::PathBuf::from("dist/desktop-server.js"));

    let mut child = Command::new("node")
        .arg(&engine_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to start engine");

    let stdout = child.stdout.take().expect("No stdout");
    let stderr = child.stderr.take().expect("No stderr");

    // Store child for later cleanup
    {
        let state = app.state::<AppState>();
        *state.engine_child.lock().unwrap() = Some(child);
    }

    // Read stdout for TOKENSAVER_CONTROL_STARTED <port>
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut port = None;

    while let Ok(Some(line)) = lines.next_line().await {
        if line.starts_with("TOKENSAVER_CONTROL_STARTED ") {
            port = line.split_whitespace().nth(1).and_then(|s| s.parse().ok());
            break;
        }
    }

    // Read stderr in background
    tauri::async_runtime::spawn(async move {
        let mut err_lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = err_lines.next_line().await {
            eprintln!("[engine] {}", line);
        }
    });

    let port = match port {
        Some(p) => p,
        None => {
            eprintln!("Failed to detect engine port");
            return;
        }
    };

    // Wait for control.json handshake file
    let control_file = dirs::home_dir()
        .map(|h| h.join(".config/opencode/compress/control.json"))
        .expect("No home dir");

    let mut token = None;
    for _ in 0..30 {
        if let Ok(content) = std::fs::read_to_string(&control_file) {
            if let Ok(info) = serde_json::from_str::<ControlInfo>(&content) {
                token = Some(info.token);
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    let token = match token {
        Some(t) => t,
        None => {
            eprintln!("Failed to read control token from {}", control_file.display());
            return;
        }
    };

    // Store port/token in state
    {
        let state = app.state::<AppState>();
        *state.control_port.lock().unwrap() = Some(port);
        *state.control_token.lock().unwrap() = Some(token.clone());
    }

    // Show the main window now that engine is ready
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    // Start WebSocket subscriber
    let app_for_ws = app.clone();
    let token_clone = token.clone();
    tauri::async_runtime::spawn(async move {
        subscribe_ws(app_for_ws, port, token_clone).await;
    });
}

async fn subscribe_ws(app: AppHandle, port: u16, token: String) {
    let ws_url = format!("ws://127.0.0.1:{}/api/events?token={}", port, token);
    let url = Url::parse(&ws_url).expect("Invalid WS URL");

    let mut backoff = Duration::from_millis(1000);
    loop {
        match connect_async(url.clone()).await {
            Ok((ws_stream, _)) => {
                backoff = Duration::from_millis(1000);
                let (mut write, mut read) = ws_stream.split();

                // Auth via protocol (already in URL query)
                while let Some(msg) = read.next().await {
                    match msg {
                        Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                            if let Ok(frame) = serde_json::from_str::<WsFrame>(&text) {
                                handle_ws_frame(&app, frame);
                            }
                        }
                        Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => break,
                        Err(e) => {
                            eprintln!("WS error: {}", e);
                            break;
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => {
                eprintln!("WS connect failed: {}, retrying in {:?}", e, backoff);
                tokio::time::sleep(backoff).await;
                backoff = std::cmp::min(backoff * 2, Duration::from_secs(30));
            }
        }
    }
}

fn handle_ws_frame(app: &AppHandle, frame: WsFrame) {
    match frame.topic.as_str() {
        "budget.exceeded" => {
            let reason = frame.payload.get("reason").and_then(|v| v.as_str()).unwrap_or("Budget exceeded");
            let fallback = frame.payload.get("fallbackModel").and_then(|v| v.as_str()).unwrap_or("unknown");
            let _ = app.notification().builder()
                .title("Budget Exceeded")
                .body(&format!("{} — falling back to {}", reason, fallback))
                .show();
            update_tray_tooltip(app, "budget_exceeded");
        }
        "limit.reached" => {
            // The proxy is NOT blocked — the user decides: reset counters or stay blocked.
            let reason = frame.payload.get("reason").and_then(|v| v.as_str()).unwrap_or("Daily limit reached");
            let _ = app.notification().builder()
                .title("Daily Limit Reached")
                .body(&format!("{} — open Quota to Reset counters or Stay blocked", reason))
                .show();
            update_tray_tooltip(app, "limit_reached");
        }
        "provider.ratelimited" => {
            let provider = frame.payload.get("provider").and_then(|v| v.as_str()).unwrap_or("unknown");
            let _ = app.notification().builder()
                .title("Provider Rate Limited")
                .body(&format!("{} is rate limited, auto-rerouting...", provider))
                .show();
            update_tray_tooltip(app, "ratelimited");
        }
        "proxy.stopped" => {
            update_tray_tooltip(app, "stopped");
        }
        "hello" => {
            // Connected
            update_tray_tooltip(app, "connected");
        }
        _ => {}
    }
}

fn update_tray_tooltip(app: &AppHandle, status: &str) {
    let tooltip = match status {
        "connected" => "Bloody Token Saver — Connected",
        "budget_exceeded" => "Bloody Token Saver — Budget Exceeded!",
        "limit_reached" => "Bloody Token Saver — Daily Limit Reached (Reset or stay blocked)",
        "ratelimited" => "Bloody Token Saver — Provider Rate Limited",
        "stopped" => "Bloody Token Saver — Stopped",
        _ => "Bloody Token Saver",
    };
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

fn kill_child_gracefully(mut child: std::process::Child) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .status();
    }
    #[cfg(not(windows))]
    {
        use std::os::unix::process::ExitStatusExt;
        let _ = child.kill();
    }
    child.wait()?;
    Ok(())
}