//! Pre-Tauri activation-policy hook (macOS).
//!
//! The bundled `.app` declares `LSUIElement=true` in `Info.plist`, which
//! starts every launch as `NSApplicationActivationPolicyAccessory` — no
//! Dock icon, no menu bar. That covers production users.
//!
//! Dev builds (`cargo run`, `cargo tauri dev`, `target/debug/pengine`) have
//! no `Info.plist` applied, so they would otherwise show a brief Dock-icon
//! flash before [`crate::modules::cli::bootstrap::handle_cli_or_continue`]
//! runs from inside Tauri's `setup` callback. We close that gap by reading
//! `argv` / `env` ourselves at the top of `lib::run()` and calling
//! `[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory]`
//! before `tauri::Builder::default()` initializes anything.
//!
//! This mirrors the CLI/GUI detection in `bootstrap::handle_cli_or_continue`
//! — but it can't import that code because it must run before `tauri::App`
//! exists. Keep the two in sync when CLI subcommands or env markers change.

use std::env;
use std::io::IsTerminal;

use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};
use objc2_foundation::MainThreadMarker;

/// `true` when this process should not register a Dock icon — i.e. any CLI
/// invocation that exits without opening a window.
pub fn is_cli_invocation() -> bool {
    if env::var("PENGINE_OPEN_GUI")
        .map(|v| v == "1")
        .unwrap_or(false)
    {
        return false;
    }
    if env::var("PENGINE_LAUNCH_MODE")
        .map(|v| v == "cli")
        .unwrap_or(false)
    {
        return true;
    }

    let mut args = env::args().skip(1).filter(|a| {
        let t = a.trim();
        !t.is_empty() && !t.starts_with("-psn_")
    });
    let Some(first) = args.next() else {
        // No arguments: REPL when stdin is a TTY; otherwise treat as a GUI
        // launch (Finder / Dock / `open -a pengine`).
        return std::io::stdin().is_terminal();
    };

    matches!(
        first.as_str(),
        "--help"
            | "-h"
            | "help"
            | "--version"
            | "-V"
            | "version"
            | "--json"
            | "--continue"
            | "-p"
            | "--print"
            | "--output-format"
            | "--shell"
            | "status"
            | "clear"
            | "config"
            | "model"
            | "bot"
            | "tools"
            | "skills"
            | "fs"
            | "logs"
            | "ask"
            | "app"
    )
}

/// Promote NSApp to `Accessory` before Tauri's run loop starts. No-op when
/// not on the main thread (defensive — `lib::run()` is always main).
pub fn hide_dock_icon() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
}
