# Contributing

Start with the [project overview](README.md), [documentation index](docs/README.md), and [shared vocabulary](CONTEXT.md). Documentation fixes, bug reports, tests, accessibility improvements, and adapters are welcome. Use [Discussions](https://github.com/QuintonD/orchestrator-portal/discussions) for questions.

For significant product, protocol, or security changes, open an issue first. Explain the operator problem, affected parties, source-system semantics, failure behavior, and evidence boundary. A new abstraction should earn its complexity with at least two concrete providers or use cases.

## Development setup

Install Node.js 24 or newer and Git. Fork the repository, clone your fork, and create a branch for your change. Run commands from the repository root.

```bash
npm ci
npm run dev:demo
```

Open the local URL printed by Vite. For a separate, populated synthetic workspace, use `npm run demo` at `http://127.0.0.1:4425`.

## Validation and pull requests

Run focused tests first, followed by the standard application checks:

```bash
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

On Linux, browser dependencies may require `npx playwright install --with-deps chromium`. CI also covers Docker, Android, and desktop bundles; run relevant platform checks when your changes affect them. See [Android testing](tests/android/README.md).

Before opening a pull request to `main`, perform local CI and explicit QA appropriate to the change. Check error paths and relevant security, reliability, performance, and accessibility effects. For documentation-only changes, verify links, examples against the implementation, and the final diff; runtime tests do not apply. Record checks actually run, results, and unavailable checks in the pull request template.

Keep each pull request focused on one coherent change, target `main`, and link related issues. Small documentation and bug fixes can start directly with a pull request. Maintainers review scope, correctness, trust boundaries, and validation before merging.

Pull requests should remain provider-neutral unless they live in an adapter, preserve source authority and evidence states, test new trust boundaries, consider desktop and mobile layouts, avoid telemetry or remote scripts, update operator documentation, and keep private runtime data out of fixtures.

Add a `Signed-off-by` line to certify the [Developer Certificate of Origin](https://developercertificate.org/):

```bash
git commit -s -m "feat: add provider adapter"
```

By contributing, you agree that your contribution is licensed under Apache-2.0.
