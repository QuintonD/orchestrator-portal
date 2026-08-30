# Contributing

Thank you for helping build a calmer, safer interface for personal AI systems.

For significant product, protocol, or security changes, open an issue first. Explain the operator problem, affected parties, source-system semantics, failure behavior, and evidence boundary. A new abstraction should earn its complexity with at least two concrete providers or use cases.

```bash
npm ci
npm run dev:demo
npm run check
npm run build
npm run test:e2e
```

Pull requests should remain provider-neutral unless they live in an adapter, preserve source authority and evidence states, test new trust boundaries, consider desktop and mobile layouts, avoid telemetry or remote scripts, update operator documentation, and keep private runtime data out of fixtures.

Add a `Signed-off-by` line to certify the [Developer Certificate of Origin](https://developercertificate.org/):

```bash
git commit -s -m "feat: add provider adapter"
```

By contributing, you agree that your contribution is licensed under Apache-2.0.
