import type { Report } from "@orchestrator/contracts";

export function EvidenceStrip({ reports }: { reports: Report[] }) {
  if (!reports.length) return null;
  const states = [...new Set(reports.map((report) => report.state))].sort();
  const groups = states.map((state) => ({ state, count: reports.filter((report) => report.state === state).length }));
  const pending = reports.filter((report) => report.review === "unreviewed").length;
  return <section className="evidence-strip" aria-label="Report delivery states">
    <div><strong>{pending}</strong><span>awaiting review</span></div>
    <div className="evidence-distribution"><div className="evidence-bar" aria-hidden="true">{groups.map(({ state, count }) => <i key={state} className={`evidence-bar--${state}`} style={{ flex: count }} />)}</div>
      <div className="evidence-labels">{groups.map(({ state, count }) => <span key={state}><i className={`evidence-bar--${state}`} />{count} {state}</span>)}</div>
    </div>
  </section>;
}
