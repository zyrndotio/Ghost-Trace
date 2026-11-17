# Ghost Trace (`ghost-trace`)

Ghost Trace helps trace confusing diagnostics back to their likely upstream cause. It examines the complete active file with line numbers and the error diagnostics reported by VS Code, then gives guidance without editing your code.

## Preview

<video src="./assets/demo.mp4" controls width="100%"></video>

[Open the demo video](./assets/demo.mp4) if the video player is unavailable.

## Features

- **`@trace` chat participant:** Ask `@trace` to diagnose the active editor. It includes the numbered source and current error diagnostics from all files, then explains the likely root cause and why a later diagnostic may have cascaded from it.
- **`#ghostTrace` Language Model Tool:** Reference `#ghostTrace` in Copilot Agent to invoke `ghost_trace_diagnose`. Its optional `targetLine` input focuses the diagnosis on a one-based line number.
- **Clickable line-jump links:** `@trace` responses can include `[Line X]` links that navigate to the corresponding active-file line and highlight it briefly.
- **Learning follow-ups:** `@trace` offers follow-up prompts about error cascades and prevention.
- **Language-agnostic guidance:** Diagnosis is based on the active file's language and syntax rather than a fixed language list.
- **Read-only behavior:** Ghost Trace explains the cause and how to address it; it never edits or applies changes to user code.

## Requirements

- Visual Studio Code `1.146.0` or later.
- GitHub Copilot and Copilot Chat for chat participant and Agent usage.
- Bun is required only to install dependencies and build from source.

## Use

1. Open a file with an error diagnostic.
2. In Copilot Chat, ask `@trace` to investigate, or reference `#ghostTrace` in Copilot Agent.
3. Optionally provide a `targetLine` when invoking the language model tool.
4. Follow the explanation; in `@trace` responses, click a line link to navigate to and briefly highlight that location.

## Build from Source

```sh
git clone https://github.com.git/zyrndotio/ghost-trace.git
cd ghost-trace
bun install
bun run compile
```

Run `bun run watch` to rebuild the CommonJS extension bundle as source files change.

## License

This project is licensed under the [MIT License](./LICENSE).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.
