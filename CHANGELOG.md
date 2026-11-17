# Change Log

All notable changes to **Ghost Trace** (`ghost-trace`) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com), and this project adheres to [Semantic Versioning](https://semver.org).

## - 2026-11-17

### 0.0.1

- Added the `@trace` chat participant for diagnosing errors in the active editor.
- Added the `#ghostTrace` / `ghost_trace_diagnose` Language Model Tool for Copilot Agent, with an optional one-based `targetLine`.
- Included the complete active file as line-numbered source and collected error diagnostics from all files for diagnosis.
- Added clickable line-jump links to `@trace` responses; links navigate to a one-based line and highlight it temporarily.
- Added learning follow-up prompts about why errors cascade and how to prevent them.
- Kept diagnosis guidance-only: Ghost Trace explains likely root causes and why errors cascaded, and does not edit user code.
- Added a Bun build pipeline with `compile` and `watch` scripts that bundle the extension as CommonJS.
