export function scanMessage(scan) {
  const { evaluated, total } = scan.coverage;
  if (scan.status === "unavailable") return "Market data is unavailable. No reliable alert scan could be completed.";
  if (scan.status === "stale") return "Market data is older than the expected session. Alerts were not evaluated.";
  if (scan.status === "partial") return `Incomplete scan: ${evaluated} of ${total} companies evaluated. Missing, stale, or incomplete data may hide other moves.`;
  return `Completed EOD scan: ${evaluated} of ${total} companies evaluated.`;
}

export function emptyAlertsMessage(scan) {
  return scan.status === "complete"
    ? "No threshold crossings detected in the completed EOD scan."
    : "No alerts to display. Coverage is incomplete; this is not an all-clear.";
}
