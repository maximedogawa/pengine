//! Native command registry — single source of truth for the CLI surface.
//!
//! The registry drives `pengine help` and `GET /v1/cli/commands`. Adding a command
//! is one entry here + one handler function + (for subcommand dispatch) one arm
//! in [`super::bootstrap`].

use serde::Serialize;

/// Metadata for a native (CLI-only) command.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct NativeCommand {
    pub name: &'static str,
    pub summary: &'static str,
    /// Long-form help shown by `/help <name>` (and `pengine help <name>`).
    /// Lines are printed as-is, so format usage examples here.
    pub details: &'static str,
}

/// Canonical registry. Order is the order `help` prints them.
pub const COMMANDS: &[NativeCommand] = &[
    NativeCommand {
        name: "help",
        summary: "Show this help (or detailed help for a specific command).",
        details:
            "Usage: /help [command]\n\nWith no argument, lists every command.\nWith an argument, prints detailed usage for that command.",
    },
    NativeCommand {
        name: "app",
        summary:
            "Open the desktop window (new process; run alongside a terminal `pengine` session).",
        details:
            "Usage: pengine app\n\nLaunches the Pengine desktop window in a separate process so the\nterminal session can keep running. Not available over the Telegram bridge.",
    },
    NativeCommand {
        name: "version",
        summary: "Print the Pengine version and git commit.",
        details: "Usage: pengine version  (alias: -V, --version)",
    },
    NativeCommand {
        name: "status",
        summary: "Show bot, Ollama, and MCP status.",
        details:
            "Usage: pengine status\n\nReports: Telegram bot connection, active + preferred Ollama model,\nnumber of MCP tools, key user settings, and store path.",
    },
    NativeCommand {
        name: "doctor",
        summary: "Run environment diagnostics (Ollama, MCP, keychain, store, network).",
        details:
            "Usage: pengine doctor\n\nProbes each subsystem and prints a checklist with [ok] / [warn] / [fail]\nplus a one-line hint for any failures.",
    },
    NativeCommand {
        name: "config",
        summary: "Show or set user settings (e.g. skills_hint_max_bytes=12000).",
        details:
            "Usage: pengine config              # list settings\n       pengine config key=value   # set (clamped to allowed range)\n\nKnown keys: skills_hint_max_bytes",
    },
    NativeCommand {
        name: "model",
        summary: "List Ollama models; set preferred by name, or by # (loads model as daemon active); --clear.",
        details:
            "Usage: pengine model                # list models\n       pengine model <name>         # set preferred by name\n       pengine model <#>            # set preferred + load in Ollama daemon\n       pengine model --clear        # clear preference (use daemon active)",
    },
    NativeCommand {
        name: "bot",
        summary: "Connect or disconnect the Telegram bot.",
        details:
            "Usage: pengine bot connect <token>\n       pengine bot disconnect\n\nVerifies the token, persists metadata to connection.json, and stores the\ntoken in the OS keychain. Tokens never reach disk.",
    },
    NativeCommand {
        name: "tools",
        summary: "List MCP tools (optional search substring).",
        details:
            "Usage: pengine tools                # list every connected MCP tool\n       pengine tools <substring>    # filter by name/server/description",
    },
    NativeCommand {
        name: "mcp",
        summary: "List, add, remove, or import MCP servers.",
        details:
            "Usage:\n  \
             pengine mcp                                              # list servers\n  \
             pengine mcp list                                         # list servers\n  \
             pengine mcp add <name> --url <url> [--header K:V]…       # add HTTP MCP server (Claude `\"type\":\"http\"`)\n  \
             pengine mcp add <name> --image <ref> [flags]             # install Docker MCP server (uses podman/docker)\n  \
             pengine mcp add <name> --command <cmd> [--arg <a>]…      # add plain stdio server\n  \
             pengine mcp remove <name>                                # remove a server (and its custom_tool entry, if any)\n  \
             pengine mcp import <path>                                # merge a Claude Code mcpServers config\n\n\
             Common flags:\n  \
             --header \"Key: value\" / --header Key=value             # for HTTP servers\n  \
             --env KEY=value                                          # for stdio servers\n  \
             --mount-workspace / --mount-rw / --append-roots          # for Docker images\n  \
             --direct-return                                          # send tool output straight to the user (no model summarisation)",
    },
    NativeCommand {
        name: "skills",
        summary: "List, enable, or disable skills.",
        details:
            "Usage: pengine skills                       # list\n       pengine skills enable <slug>         # enable\n       pengine skills disable <slug>        # disable",
    },
    NativeCommand {
        name: "fs",
        summary: "List, add, or remove MCP filesystem roots.",
        details:
            "Usage: pengine fs                    # list current roots\n       pengine fs add <path>         # add an absolute path\n       pengine fs remove <path>      # remove a root",
    },
    NativeCommand {
        name: "logs",
        summary: "Stream log events (--follow / --tail).",
        details:
            "Usage: pengine logs                  # tail last 50 audit lines\n       pengine logs --tail 200       # tail last N\n       pengine logs --follow         # stream live (REPL/CLI only; not Telegram)",
    },
    NativeCommand {
        name: "ask",
        summary: "Send a message to the agent (AI path).",
        details:
            "Usage: pengine ask \"<prompt>\"\n\nRuns one agent turn. In REPL, free text without a leading `/` is the same\npath. Prefix with /think or /nothink to override reasoning mode.\n\nFile mentions: tokens like @path/to/file are inlined (capped at 64 KB)\nbefore the prompt is sent.",
    },
    NativeCommand {
        name: "clear",
        summary: "Clear the REPL screen (REPL-only).",
        details: "Usage: /clear  (REPL-only; same as Ctrl+L on most terminals)",
    },
    NativeCommand {
        name: "compact",
        summary: "Summarize the current REPL session and reset history (REPL-only).",
        details:
            "Usage: /compact\n\nGenerates a one-shot summary of the current session and seeds a fresh\nsession with the summary as context. Use when the conversation gets\ntoo long for the model's context window.",
    },
    NativeCommand {
        name: "resume",
        summary: "Resume the most recent saved REPL session (REPL-only).",
        details:
            "Usage: /resume       # in REPL\n       pengine --continue   # one-shot equivalent",
    },
    NativeCommand {
        name: "cost",
        summary: "Show token usage and estimated cost for the current session.",
        details:
            "Usage: /cost\n\nShows prompt + completion tokens for the current REPL session, plus a\nrough cost estimate when running a cloud Ollama model.",
    },
    NativeCommand {
        name: "plan",
        summary: "Toggle plan mode (read-only; agent produces plans, doesn't execute writes).",
        details:
            "Usage: /plan          # toggle\n       /plan on        # force on\n       /plan off       # force off\n\nIn plan mode, the agent receives a planning system prompt and write tools\n(memory writes, fs writes) are removed from the tool catalog.",
    },
    NativeCommand {
        name: "exit",
        summary: "Exit the REPL.",
        details: "Usage: /exit  (alias: /quit, exit, quit, Ctrl+D)",
    },
    NativeCommand {
        name: "quit",
        summary: "Exit the REPL.",
        details: "Usage: /quit  (alias: /exit, exit, quit, Ctrl+D)",
    },
];

pub fn lookup(name: &str) -> Option<&'static NativeCommand> {
    COMMANDS.iter().find(|c| c.name == name)
}
