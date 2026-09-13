# Release SBOM

Generate the metadata after staging all nine release binaries from the clean
released checkout:

```sh
npm ci
node scripts/release-sbom.mjs <staged-assets>
node --test scripts/release-sbom.test.mjs
```

The generator writes `SBOM.cdx.json` in that directory. Run the release manifest
command in [the release workflow](releases.md) afterwards. Its validator checks
the SBOM, binds it to the release commit, nine exact artifact hashes and broker
archive source-file hashes, then includes the SBOM checksum in the manifest and
`SHA256SUMS.txt`. The SBOM is release metadata; there remain nine binary
distributions. Do not publish test probe APKs or signing material.

The generator runs `npm sbom --omit=dev --sbom-format cyclonedx` against the
installed dependency tree. It compares package identifiers, versions, integrity
hashes and dependency edges with `--package-lock-only` output, so stale installed
production dependencies fail. It also walks the lockfile's production and peer
dependency edges independently. Some npm versions omit a package when it is both
a root development dependency and a production transitive dependency; the
generator restores those required packages from full installed and locked SBOMs,
checks their identities and hashes, and excludes development-only edges.
Installed metadata supplies package license
declarations that lockfile-only output can omit. Undeclared licenses stay
undeclared with an explicit status property; the tool does not infer third-party
license grants. Official vendored CycloneDX 1.5 schemas validate the output using
Ajv. Schema provenance and upstream licenses are retained under
`scripts/third-party/cyclonedx-1.5/`.

The release manifest independently regenerates that source inventory and checks
every dependency, license declaration, runtime pin and native field. A JSON file
with valid artifact hashes but forged package metadata cannot pass this check.

The inventory includes portal server runtime packages and the web dependencies
bundled into the UI; original broker source with no external npm dependencies;
gateway and companion app IDs, versions and Android SDK requirements; all six
Node.js runtime pins from `scripts/desktop/runtime.json`; and the confined source
container's pinned Node image digest. Android declarations are checked before
claiming no runtime Maven dependencies. Broker dependency declarations must
remain empty or the generator stops for an inventory update.

Completeness is explicitly `incomplete`: this is an application dependency and
distribution inventory. Android framework and firmware, browsers, Node's embedded
third-party internals, container operating-system packages and build toolchains
are outside scope. The six desktop Node entries identify upstream archives and
their digests; the desktop distributions contain the Node executable and notices,
not every file in those upstream archives. The image digest identifies an optional
runtime input and is not an operating-system package SBOM. No vulnerability scan
or legal compliance certification is implied.

Unit tests use synthetic artifact metadata to challenge schema, provenance,
hash, scope, graph and version validation. A publishable SBOM requires the real
staged files and a clean checkout; the CLI has no dirty-tree publication override.
