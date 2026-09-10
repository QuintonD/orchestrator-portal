import { modelClasses, modelEvidence, type ModelClass } from "@orchestrator/contracts";

export function ModelRecommendation({ modelClass }: { modelClass: ModelClass | undefined }) {
  const guide = modelClass ? modelClasses[modelClass] : undefined;
  return <span>{guide ? `${guide.label}. ${guide.recommendation}` : "No recommendation recorded for this mandate. Choose a model in the source and check its result."}</span>;
}

export function ModelGuide() {
  return <details className="model-guide"><summary>Choose the right model</summary>
    <p>Recommendations guide your choice. They do not change the connected model or its reasoning effort. Use the exact model ID your source offers. Choose reasoning in the assistant’s conversation or profile for compatible APIs, Hermes and OpenClaw; configure it in the source for other integrations. To use different models for different roles, add separate connections or source agents.</p>
    <dl>{Object.entries(modelClasses).map(([id, guide]) => <div key={id}><dt>{guide.label}</dt><dd>{guide.use} {guide.recommendation} {guide.escalation}</dd></div>)}</dl>
    <p>Other providers and local models can fill these classes after passing the role's acceptance checks. A model benchmark does not establish tool access, task quality or account availability. No automatic escalation, provider switch or paid fallback is performed.</p>
    <p>Compatible API, Hermes and webhook turns have a 120-second deadline. Deep reasoning may exceed it; use the native source for longer work. Compatible API output defaults to 4,096 tokens, configurable up to 16,384. A timeout is uncertain and must be inspected before retrying.</p>
    <details><summary>Benchmark evidence · reviewed {modelEvidence.reviewedAt}</summary>
      <p>{modelEvidence.interpretation}</p>
      <table><caption>{modelEvidence.index}</caption><thead><tr><th>Model and effort</th><th>Score</th></tr></thead><tbody>{modelEvidence.models.map((entry) => <tr key={`${entry.model}-${entry.effort}`}><td><a href={entry.url} target="_blank" rel="noreferrer">{entry.model} · {entry.effort}</a></td><td>{entry.score}{entry.estimated ? " (estimate)" : ""}</td></tr>)}</tbody></table>
      <p><a href={modelEvidence.methodologyUrl} target="_blank" rel="noreferrer">Artificial Analysis methodology</a> · <a href={modelEvidence.updateUrl} target="_blank" rel="noreferrer">v4.3 update</a></p>
    </details>
  </details>;
}
