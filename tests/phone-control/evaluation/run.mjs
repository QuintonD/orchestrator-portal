import { openSync, closeSync, fstatSync, readSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRun, EvaluationInputError, MAX_INPUT_BYTES } from "./evaluate.mjs";
import { frontierManifest } from "./manifest.mjs";

function readJson(path) {
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new EvaluationInputError("input_size");
    const data = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let offset = 0;
    while (offset < data.length) {
      const bytes = readSync(fd, data, offset, data.length - offset, null);
      if (!bytes) break;
      offset += bytes;
    }
    if (offset > MAX_INPUT_BYTES) throw new EvaluationInputError("input_size");
    return JSON.parse(data.subarray(0, offset).toString("utf8"));
  } finally { closeSync(fd); }
}

export function main(args) {
  try {
    if (args.length < 2 || args.length > 3) throw new EvaluationInputError("usage");
    const [input, output, manifestFile] = args;
    if (resolve(input) === resolve(output) || (manifestFile && resolve(manifestFile) === resolve(output))) throw new EvaluationInputError("output_conflict");
    const report = evaluateRun(manifestFile ? readJson(manifestFile) : frontierManifest, readJson(input));
    // Exclusive create preserves prior failed runs instead of replacing their evidence.
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ passed: report.passed, evidenceKind: report.evidenceKind, gateScope: report.gateScope, productEvidence: report.productEvidence, failures: report.failures, taskSuccess: report.metrics.taskSuccess })}\n`);
    return report.passed ? 0 : 1;
  } catch (error) {
    const code = error instanceof EvaluationInputError ? error.code : "invalid_or_unavailable_input_output";
    process.stderr.write(`${JSON.stringify({ passed: false, error: code })}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
