import { scanMessage } from "@/lib/scan-status.mjs";

export default function ScanStatus({ scan }) {
  if (!scan) return null;
  const missing = scan.coverage.companies.filter((c) => c.status !== "ok");
  const dates = [...new Set(scan.coverage.companies.map((c) => c.as_of).filter(Boolean))].sort();
  return (
    <div className="card" role="status" style={{ marginBottom: "16px", borderLeft: `3px solid var(--accent-${scan.status === "complete" ? "green" : "amber"})` }}>
      <p style={{ fontSize: "13px", lineHeight: "1.5" }}>{scanMessage(scan)}</p>
      <p className="section-subtitle" style={{ marginTop: "6px" }}>
        {scan.source}{dates.length > 0 ? ` · As of ${dates.join(", ")}` : " · No completed bars"}
      </p>
      <details style={{ marginTop: "8px", fontSize: "12px" }}>
        <summary>Coverage and freshness</summary>
        <p style={{ marginTop: "8px" }}>{scan.freshness_policy}</p>
        {missing.length > 0 && (
          <ul style={{ paddingLeft: "18px", marginTop: "8px" }}>
            {missing.map((company) => (
              <li key={company.ticker} style={{ marginBottom: "6px" }}>
                {company.ticker}: {company.status.replaceAll("_", " ")}.
                {company.issues.length > 0 && ` ${company.issues.join(" ")}`}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
