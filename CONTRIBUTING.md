# Contributing

Thanks for your interest in improving Ghost Trace. Bug reports, feature requests, and pull requests are welcome.

## Set up the project

```sh
git clone https://github.com/zyrndotio/Ghost-Trace.git
cd ghost-trace
bun install
```

## Build and test

Compile the extension and run the linter:

```sh
bun run compile
bun run lint
```

To try the extension interactively, open the repository in VS Code and press **F5** to launch the Extension Development Host using the `Run Extension` configuration. The project's automated extension tests can be run with:

```sh
bun run test
```

## Pull requests

- Keep changes focused and describe the user-facing behavior they affect.
- Run the build and linter before submitting.
- Include or update tests when changing behavior.
