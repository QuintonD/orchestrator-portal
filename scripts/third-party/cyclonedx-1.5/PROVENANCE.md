# CycloneDX JSON schema provenance

Retrieved 13 September 2026 from the upstream CycloneDX specification's `1.5`
revision. These files are unchanged. The schema identifies Apache License 2.0;
the upstream license is retained as `LICENSE`. These are release validation
inputs, not application runtime code.

| File | Upstream source | SHA-256 |
| --- | --- | --- |
| bom-1.5.schema.json | [CycloneDX schema](https://raw.githubusercontent.com/CycloneDX/specification/1.5/schema/bom-1.5.schema.json) | `067f7824b08653839ea050ae9e09ca48375eadc2652b0e2a299476e7db90335b` |
| spdx.schema.json | [SPDX license schema](https://raw.githubusercontent.com/CycloneDX/specification/1.5/schema/spdx.schema.json) | `4f6e2b05c05d26a4f2dc5879fbc2fca94b0a28db46289d0c51345621b71cfbfc` |
| jsf-0.82.schema.json | [JSON signature schema](https://raw.githubusercontent.com/CycloneDX/specification/1.5/schema/jsf-0.82.schema.json) | `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae` |
| LICENSE | [Upstream license](https://raw.githubusercontent.com/CycloneDX/specification/1.5/LICENSE) | `6c29f22a4a7385285c6f579ec9f33c5e989f00739d6b257243a0b082ec9447ae` |

Updates require deliberate review of schema, provenance, license and digest
changes. The release helper currently requires npm's CycloneDX 1.5 output and
fails for a changed specification version.
