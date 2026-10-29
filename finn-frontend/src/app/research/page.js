"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/layout/BottomNav";
import { fetchResearch, fetchResearchCompanies } from "@/lib/api";
import { startRequest } from "@/lib/request-lifecycle.mjs";
import { researchStatusMessage, KIND_LABELS } from "@/lib/research-status.mjs";

const TABS = [{ id: "snapshot", label: "Snapshot" }, { id: "outlook", label: "Guidance & risks" }, { id: "sources", label: "Sources" }];

export default function ResearchPage() {
  const [selectedTicker, setSelectedTicker] = useState("INFY.NS");
  const [documentId, setDocumentId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("snapshot");
  const [searchError, setSearchError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [catalogError, setCatalogError] = useState("");
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${selectedTicker}:${documentId}:${attempt}`;
  const current = result?.key === requestKey ? result : null;
  const snapshot = current?.data;

  useEffect(() => startRequest(
    (signal) => fetchResearchCompanies({ signal }),
    ({ data, error }) => { setCompanies(data ?? []); setCatalogError(error ?? ""); },
  ), []);

  useEffect(() => startRequest(
    (signal) => fetchResearch(selectedTicker, { signal, documentId }),
    (response) => setResult({ key: requestKey, ...response }),
  ), [selectedTicker, documentId, requestKey]);

  const selectTicker = (ticker) => {
    setSearchError("");
    setSelectedTicker(ticker);
    setDocumentId("");
    setAttempt((value) => value + 1);
  };
  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const symbol = searchQuery.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9&-]{0,31}(\.(NS|BO))?$/.test(symbol)) {
      setSearchError("Enter an NSE/BSE symbol such as INFY or RELIANCE.NS.");
      return;
    }
    selectTicker(symbol.includes(".") ? symbol : `${symbol}.NS`);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div><span className="app-header__logo">FINN</span><span className="app-header__subtitle">Pull Research</span></div>
        <span className="font-mono text-blue font-bold" style={{ fontSize: "12px" }}>{selectedTicker}</span>
      </header>
      <main className="app-content">
        <div className="section-header"><div>
          <h1 className="section-title">Evidence-backed research</h1>
          <p className="section-subtitle">Selected primary-document excerpts, with original page references.</p>
        </div></div>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input aria-label="Company ticker" type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Enter ticker, e.g. INFY" style={{ minWidth: 0, flex: 1, padding: "10px", background: "var(--bg-card)", color: "var(--text-primary)", border: "var(--border-subtle)", borderRadius: "var(--radius-md)" }} />
          <button type="submit" className="card" style={{ padding: "10px", color: "var(--accent-blue)", cursor: "pointer" }}>Research</button>
        </form>
        {searchError && <p role="alert">{searchError}</p>}
        <p className="section-subtitle">Available document coverage:</p>
        {companies.find((company) => company.ticker === selectedTicker)?.documents?.length > 0 && <label style={{ display: "block", marginBottom: "12px" }}>
          Historical reporting document
          <select aria-label="Reporting document" value={documentId} onChange={(event) => setDocumentId(event.target.value)} style={{ width: "100%", marginTop: "8px", padding: "10px", color: "var(--text-primary)", background: "var(--bg-card)" }}>
            <option value="">Default: April 2025 (Q4 / FY25)</option>
            {companies.find((company) => company.ticker === selectedTicker).documents.map((document) => <option key={document.id} value={document.id}>{document.period}</option>)}
          </select>
        </label>}
        {catalogError && <p role="alert" className="section-subtitle">Could not load the supported-company list.</p>}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", margin: "8px 0 16px" }}>
          {companies.map((company) => <button key={company.ticker} onClick={() => selectTicker(company.ticker)} className="card" style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "var(--accent-blue)", cursor: "pointer" }}>{company.name} - {company.documents.length} reviewed documents</button>)}
        </div>
        <div role="tablist" aria-label="Research views" style={{ display: "flex", borderBottom: "var(--border-subtle)", marginBottom: "16px" }}>
          {TABS.map((tab) => <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: "12px 4px", background: "transparent", border: "none", borderBottom: activeTab === tab.id ? "2px solid var(--accent-blue)" : "none", color: activeTab === tab.id ? "var(--accent-blue)" : "var(--text-secondary)", cursor: "pointer", fontSize: "12px" }}>{tab.label}</button>)}
        </div>
        {!current && <div role="status"><p>Retrieving and checking primary-document evidence...</p><div className="skeleton skeleton-card" /></div>}
        {current?.error && <div className="error-state" role="alert"><p>{current.error}</p><button onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>}
        {snapshot && <>
          <div className="card" role="status" style={{ marginBottom: "16px", borderLeft: "3px solid var(--accent-amber)" }}>
            <strong>{snapshot.company_name ?? selectedTicker}</strong>
            <p style={{ marginTop: "6px", fontSize: "13px", lineHeight: "1.5" }}>{researchStatusMessage(snapshot)}</p>
            {snapshot.period && <p className="section-subtitle" style={{ marginTop: "6px" }}>{snapshot.period}. Read this as a historical snapshot, not current guidance.</p>}
            {snapshot.issues.map((issue, index) => <p key={index} className="section-subtitle" style={{ marginTop: "6px" }}>{issue}</p>)}
            {snapshot.status === "unavailable" && <button onClick={() => setAttempt((value) => value + 1)} style={{ marginTop: "8px" }}>Retry retrieval</button>}
          </div>
          {activeTab !== "sources" && snapshot.sections.filter((section) => activeTab === "snapshot" ? ["overview", "performance"].includes(section.id) : ["guidance", "risks"].includes(section.id)).map((section) => (
            <section key={section.id} style={{ marginBottom: "20px" }}>
              <h2 className="section-title" style={{ fontSize: "16px", marginBottom: "10px" }}>{section.title}</h2>
              {section.message && <p role="status" className="section-subtitle">{section.message}</p>}
              {section.claims.map((claim) => <EvidenceCard key={claim.id} claim={claim} />)}
            </section>
          ))}
          {activeTab === "sources" && <section>
            <h2 className="section-title" style={{ marginBottom: "12px" }}>Primary documents</h2>
            {snapshot.documents.length === 0 && <p>No verified document is available for this request.</p>}
            {snapshot.documents.map((document) => <article key={document.id} className="card" style={{ marginBottom: "12px", overflowWrap: "anywhere" }}>
              <a href={document.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-blue)" }}>{document.title}</a>
              <p className="section-subtitle" style={{ marginTop: "8px" }}>Call date {document.event_date} - {document.page_count} PDF pages</p>
              <p className="section-subtitle">{document.retrieval === "network" ? "Retrieved from primary source" : "Verified cached document"}. Retrieved at {document.retrieved_at}</p>
              <details style={{ marginTop: "8px", fontSize: "12px" }}><summary>Document integrity</summary><p>SHA-256: {document.sha256}</p><p>Reviewed source manifest: {document.manifest_version}</p><p>Page links use one-based PDF page numbers.</p></details>
            </article>)}
          </section>}
          {snapshot.limitations.length > 0 && <details className="card" style={{ marginTop: "16px", fontSize: "12px", lineHeight: "1.6" }}><summary>Scope and limitations</summary><ul style={{ paddingLeft: "18px", marginTop: "8px" }}>{snapshot.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>}
        </>}
      </main>
      <BottomNav active="research" />
    </div>
  );
}

function EvidenceCard({ claim }) {
  return <article className="card" style={{ marginBottom: "10px" }}>
    <p style={{ fontSize: "11px", color: "var(--accent-blue)" }}>{KIND_LABELS[claim.kind]} - {claim.period}</p>
    <h3 style={{ fontSize: "14px", margin: "8px 0" }}>{claim.title}</h3>
    <blockquote style={{ margin: 0, fontSize: "13px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{claim.text}</blockquote>
    <p className="section-subtitle" style={{ marginTop: "8px" }}>{claim.speaker}</p>
    <a href={claim.evidence.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: "8px", fontSize: "12px", color: "var(--accent-blue)" }}>Read primary source - PDF page {claim.evidence.page}</a>
  </article>;
}
