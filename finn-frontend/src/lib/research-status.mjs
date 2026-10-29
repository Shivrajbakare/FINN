export const KIND_LABELS = Object.freeze({
  document_context: "Document context",
  reported_actual: "Reported actual (management-reported)",
  management_guidance: "Management guidance (forward-looking)",
  management_commentary: "Management commentary",
});

export function researchStatusMessage(snapshot) {
  if (snapshot.status === "unsupported") return "Research is unsupported for this ticker. No verified claims are available.";
  if (snapshot.status === "unavailable") return "Research is unavailable: primary-source evidence could not be verified.";
  if (snapshot.status === "partial") return "Partial snapshot: some evidence could not be verified. Only supported excerpts are shown.";
  return "Source-verified historical excerpts. These are selected company statements, not AI-generated financial estimates.";
}
