export const JOB_LABELS = {
  queued: "Queued — waiting for the research worker",
  searching_sources: "Searching official sources",
  downloading: "Downloading selected document",
  verifying: "Verifying document integrity",
  extracting: "Extracting page-level evidence",
  preparing_research: "Preparing research",
  ready: "Ready",
  failed: "Research could not be completed",
};

export function groupDocuments(documents) {
  if (typeof Object.groupBy === "function") {
    return Object.groupBy(documents, (document) => document.document_type);
  }
  return (documents || []).reduce((acc, doc) => {
    const key = doc.document_type;
    (acc[key] = acc[key] || []).push(doc);
    return acc;
  }, {});
}

export function snapshotFreshness(snapshot, now = Date.now()) {
  if (snapshot.status === "superseded") return "Superseded source version — historical evidence only";
  if (Date.parse(snapshot.cache_expires_at) <= now) return "Expired cache — retrieve the source again to reverify";
  return "Historical selected-document research";
}

export async function waitForJob(load, signal, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    signal.throwIfAborted();
    const job = await load();
    signal.throwIfAborted();
    if (job.status === "failed") throw new Error(job.message || "Research processing failed. Please retry.");
    if (job.status === "ready") return job;
    await delay(1500);
  }
  throw new Error("The worker has not finished yet. Retry to resume this job. Check that the research worker is running.");
}
