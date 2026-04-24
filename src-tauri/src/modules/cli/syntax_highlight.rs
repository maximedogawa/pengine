//! Optional 24-bit ANSI highlighting for CLI / REPL fenced code (dark theme).

use std::sync::OnceLock;
use syntect::easy::HighlightLines;
use syntect::highlighting::ThemeSet;
use syntect::parsing::{SyntaxReference, SyntaxSet};
use syntect::util::{as_24_bit_terminal_escaped, LinesWithEndings};

struct HighlightEngine {
    syntax_set: SyntaxSet,
    theme_set: ThemeSet,
}

fn engine() -> &'static HighlightEngine {
    static E: OnceLock<HighlightEngine> = OnceLock::new();
    E.get_or_init(|| HighlightEngine {
        syntax_set: SyntaxSet::load_defaults_newlines(),
        theme_set: ThemeSet::load_defaults(),
    })
}

fn dark_theme(ts: &ThemeSet) -> &syntect::highlighting::Theme {
    const PREFERRED: &[&str] = &[
        "base16-ocean.dark",
        "base16-mocha.dark",
        "Solarized (dark)",
        "InspiredGitHub",
    ];
    for key in PREFERRED {
        if let Some(t) = ts.themes.get(*key) {
            return t;
        }
    }
    ts.themes
        .values()
        .next()
        .expect("syntect embeds default themes")
}

fn resolve_syntax<'a>(ss: &'a SyntaxSet, lang: &str) -> &'a SyntaxReference {
    let l = lang.trim();
    if l.is_empty() {
        return ss.find_syntax_plain_text();
    }
    ss.find_syntax_by_extension(l)
        .or_else(|| ss.find_syntax_by_token(l))
        .unwrap_or_else(|| ss.find_syntax_plain_text())
}

/// One element per source line (no embedded `\n`), with 24-bit ANSI sequences.
/// Returns `None` if highlighting fails so callers can fall back to plain text.
pub fn highlight_fence_body(lang: &str, code: &str) -> Option<Vec<String>> {
    let eng = engine();
    let syntax = resolve_syntax(&eng.syntax_set, lang);
    let theme = dark_theme(&eng.theme_set);
    let mut h = HighlightLines::new(syntax, theme);
    let mut lines = Vec::new();
    for line in LinesWithEndings::from(code) {
        let regions = h.highlight_line(line, &eng.syntax_set).ok()?;
        let escaped = as_24_bit_terminal_escaped(&regions[..], true);
        lines.push(trim_line_ending(&escaped));
    }
    Some(lines)
}

fn trim_line_ending(s: &str) -> String {
    s.trim_end_matches(['\n', '\r']).to_string()
}

#[cfg(test)]
mod tests {
    use super::highlight_fence_body;

    #[test]
    fn highlight_rust_emits_ansi() {
        let lines = highlight_fence_body("rust", "fn main() {}\n").expect("highlight");
        let joined = lines.join("\n");
        assert!(
            joined.contains('\x1b'),
            "expected 24-bit ansi escapes: {joined:?}"
        );
    }
}
