"use client";

import { useState } from "react";
import BottomNav from "@/components/layout/BottomNav";

const DEMO_COMPANIES = [
  { ticker: "TITAN.NS", name: "Titan Company", sector: "Consumer Discretionary", tag: "Research Demo" },
  { ticker: "ZOMATO.NS", name: "Zomato Ltd", sector: "Internet Platform", tag: "Inflection Case" },
  { ticker: "DIXON.NS", name: "Dixon Tech", sector: "EMS / Manufacturing", tag: "Guidance Track" },
  { ticker: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy / Retail / Telecom", tag: "Portfolio" },
  { ticker: "TCS.NS", name: "TCS", sector: "IT Services", tag: "Portfolio" },
];

export default function ResearchPage() {
  const [selectedTicker, setSelectedTicker] = useState("TITAN.NS");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("narrative"); // "snapshot" | "narrative" | "chat"
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    {
      sender: "finn",
      text: "I am ready to analyze Titan Company (TITAN.NS) using its FY24 Annual Report and Q1-Q4 earnings call transcripts. What would you like to verify?",
      citations: ["Q4 FY24 Concall Transcript p.4", "FY24 Annual Report p.78"],
    },
  ]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    let ticker = searchQuery.trim().toUpperCase();
    if (!ticker.endsWith(".NS") && !ticker.endsWith(".BO")) {
      ticker = `${ticker}.NS`;
    }
    setSelectedTicker(ticker);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: userMsg },
      {
        sender: "finn",
        text: `Analysis for ${selectedTicker}: Based directly on primary disclosures, management discussed this topic during the recent analyst briefing.`,
        citations: ["Earnings Call Q3/Q4 Transcript"],
      },
    ]);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="app-header__logo">FINN</span>
          <span className="app-header__subtitle">Pull Research</span>
        </div>
        <span className="font-mono text-blue font-bold" style={{ fontSize: "12px" }}>
          {selectedTicker.replace(".NS", "")}
        </span>
      </header>

      <main className="app-content">
        {/* Search Bar for Any NSE Ticker */}
        <form onSubmit={handleSearchSubmit} style={{ marginBottom: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--bg-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "4px 8px",
            }}
          >
            <span style={{ fontSize: "14px", marginRight: "6px" }}>🔍</span>
            <input
              type="text"
              placeholder="Search any NSE ticker (e.g. INFY, MARICO)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "6px 12px",
                background: "var(--accent-blue)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Load
            </button>
          </div>
        </form>

        {/* Quick Ticker Chips */}
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "16px", paddingBottom: "4px" }}>
          {DEMO_COMPANIES.map((c) => (
            <button
              key={c.ticker}
              onClick={() => setSelectedTicker(c.ticker)}
              style={{
                padding: "4px 10px",
                borderRadius: "16px",
                fontSize: "11px",
                whiteSpace: "nowrap",
                background: selectedTicker === c.ticker ? "var(--accent-blue-glow)" : "var(--bg-card)",
                color: selectedTicker === c.ticker ? "var(--accent-blue)" : "var(--text-secondary)",
                border: selectedTicker === c.ticker ? "1px solid var(--accent-blue)" : "var(--border-subtle)",
                cursor: "pointer",
              }}
            >
              {c.ticker.replace(".NS", "")} · <span style={{ opacity: 0.7 }}>{c.tag}</span>
            </button>
          ))}
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            borderBottom: "var(--border-subtle)",
            marginBottom: "16px",
          }}
        >
          <button
            onClick={() => setActiveTab("narrative")}
            style={{
              flex: 1,
              padding: "10px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "narrative" ? "2px solid var(--accent-blue)" : "none",
              color: activeTab === "narrative" ? "var(--accent-blue)" : "var(--text-secondary)",
              fontWeight: activeTab === "narrative" ? "700" : "500",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            ⚖️ Narrative vs Numbers
          </button>
          <button
            onClick={() => setActiveTab("snapshot")}
            style={{
              flex: 1,
              padding: "10px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "snapshot" ? "2px solid var(--accent-blue)" : "none",
              color: activeTab === "snapshot" ? "var(--accent-blue)" : "var(--text-secondary)",
              fontWeight: activeTab === "snapshot" ? "700" : "500",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            🏢 Snapshot
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            style={{
              flex: 1,
              padding: "10px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "chat" ? "2px solid var(--accent-blue)" : "none",
              color: activeTab === "chat" ? "var(--accent-blue)" : "var(--text-secondary)",
              fontWeight: activeTab === "chat" ? "700" : "500",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            💬 Ask Primary Sources
          </button>
        </div>

        {/* TAB 1: Narrative vs Numbers (Hero Feature) */}
        {activeTab === "narrative" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="card" style={{ borderLeft: "4px solid var(--accent-blue)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--accent-blue)" }}>
                  HERO ANALYSIS: PROMISED VS DELIVERED
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Last 4 Quarters</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Cross-referencing CEO/CFO guidance given during earnings calls against audited quarterly filings.
              </p>
            </div>

            {/* Scorecard Rows */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "700", fontSize: "13px" }}>Jewellery Division Growth</span>
                <span
                  style={{
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "var(--accent-green-dim)",
                    color: "var(--accent-green)",
                    fontWeight: "600",
                  }}
                >
                  DELIVERED
                </span>
              </div>
              <div style={{ marginTop: "8px", fontSize: "12px", lineHeight: "1.5" }}>
                <div style={{ color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Guidance (Q1 Concall):</strong> Guided 20-22% YoY
                  growth in jewellery retail expansion despite gold price volatility.
                </div>
                <div style={{ color: "var(--text-secondary)", marginTop: "4px" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Actual (Q4 Filing):</strong> Reported 21.4% YoY segment
                  revenue growth with 11.2% EBIT margin.
                </div>
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px", fontStyle: "italic" }}>
                Source: Q1 FY24 Concall Tr. p.7 &amp; Q4 FY24 Results p.12
              </div>
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "700", fontSize: "13px" }}>International Store Expansion</span>
                <span
                  style={{
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "var(--accent-amber-dim)",
                    color: "var(--accent-amber)",
                    fontWeight: "600",
                  }}
                >
                  PARTIAL / DELAYED
                </span>
              </div>
              <div style={{ marginTop: "8px", fontSize: "12px", lineHeight: "1.5" }}>
                <div style={{ color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Guidance (Q2 Concall):</strong> Planned 15 GCC/US
                  store openings by end of Q4.
                </div>
                <div style={{ color: "var(--text-secondary)", marginTop: "4px" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Actual:</strong> 11 stores operational; remaining 4
                  delayed to H1 next fiscal due to local permitting.
                </div>
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px", fontStyle: "italic" }}>
                Source: Q2 FY24 Concall Tr. p.11 &amp; Investor Presentation p.22
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Business & Financial Snapshot */}
        {activeTab === "snapshot" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="card">
              <div style={{ fontWeight: "700", fontSize: "14px", marginBottom: "6px" }}>Core Business &amp; Segments</div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                Market leader in organized Indian jewellery (Tanishq, Mia, Zoya) with diversified lifestyle verticals in
                Watches &amp; Wearables (Fastrack, Titan), Eyecare, and Emerging Fragrances/Fashion (Taneira).
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "12px" }}>
                <div style={{ background: "var(--bg-primary)", padding: "8px", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Jewellery Share</div>
                  <div className="font-mono font-bold" style={{ fontSize: "14px", color: "var(--accent-blue)" }}>
                    ~88%
                  </div>
                </div>
                <div style={{ background: "var(--bg-primary)", padding: "8px", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Watches &amp; Wearables</div>
                  <div className="font-mono font-bold" style={{ fontSize: "14px", color: "var(--accent-purple)" }}>
                    ~8%
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: "700", fontSize: "14px", marginBottom: "8px" }}>Headline Fundamentals</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div style={{ background: "var(--bg-primary)", padding: "8px", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>EBITDA Margin</div>
                  <div className="font-mono font-bold" style={{ fontSize: "13px" }}>10.4%</div>
                </div>
                <div style={{ background: "var(--bg-primary)", padding: "8px", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>ROCE</div>
                  <div className="font-mono font-bold text-green" style={{ fontSize: "13px" }}>32.1%</div>
                </div>
                <div style={{ background: "var(--bg-primary)", padding: "8px", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Debt-to-Equity</div>
                  <div className="font-mono font-bold" style={{ fontSize: "13px" }}>0.38</div>
                </div>
                <div style={{ background: "var(--bg-primary)", padding: "8px", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Cash Conversion</div>
                  <div className="font-mono font-bold text-green" style={{ fontSize: "13px" }}>84% CFO/EBITDA</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Grounded Contextual Chat */}
        {activeTab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "420px" }}>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "12px",
                paddingRight: "4px",
              }}
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    background: m.sender === "user" ? "var(--accent-blue)" : "var(--bg-card)",
                    color: m.sender === "user" ? "#fff" : "var(--text-primary)",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md)",
                    fontSize: "12px",
                    lineHeight: "1.4",
                    border: m.sender === "user" ? "none" : "var(--border-subtle)",
                  }}
                >
                  <p>{m.text}</p>
                  {m.citations && (
                    <div style={{ marginTop: "6px", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                      {m.citations.map((c, ci) => (
                        <span
                          key={ci}
                          style={{
                            display: "inline-block",
                            fontSize: "10px",
                            color: "var(--accent-blue)",
                            background: "var(--accent-blue-glow)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            marginRight: "4px",
                            marginTop: "2px",
                          }}
                        >
                          📌 {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Ask about margins, capex, guidance..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                style={{
                  flex: 1,
                  background: "var(--bg-card)",
                  border: "var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "10px 14px",
                  background: "var(--accent-blue)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </main>

      <BottomNav active="research" />
    </div>
  );
}
