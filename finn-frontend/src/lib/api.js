/**
 * FINN API Client
 *
 * Centralized API layer for all backend communication.
 * Calls FastAPI directly. Production requires an explicit HTTPS API base.
 */

import { resolveApiBase } from "./api-config.mjs";

const API_BASE = resolveApiBase(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV === "production");

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      if (endpoint.startsWith("/research/v2/")) {
        const payload = await res.json().catch(() => null);
        const message = payload?.detail?.message;
        if (typeof message === "string") throw new Error(message);
      }
      throw new Error(`FINN could not load data (HTTP ${res.status}). Please try again.`);
    }

    return await res.json();
  } catch (err) {
    // Network errors, CORS issues, etc.
    if (err.name === "TypeError" && err.message.includes("fetch")) {
      console.error(`[API] Network error reaching ${url}:`, err.message);
      throw new Error("Cannot reach FINN backend. Is it running?");
    }
    throw err;
  }
}

/**
 * Portfolio endpoints
 */
export async function fetchPortfolio(options = {}) {
  return apiFetch("/portfolio", options);
}

export async function fetchStockDetail(ticker) {
  return apiFetch(`/portfolio/${encodeURIComponent(ticker)}`);
}

export async function fetchAlerts(volumeThreshold = 2.0, priceThreshold = 3.0, options = {}) {
  const params = new URLSearchParams({
    volume_threshold: volumeThreshold.toString(),
    price_threshold: priceThreshold.toString(),
  });
  return apiFetch(`/alerts?${params}`, options);
}

export async function fetchAllCompanies() {
  return apiFetch("/companies");
}

export async function fetchResearchCompanies(options = {}) {
  return apiFetch("/research/companies", options);
}

export async function fetchResearch(ticker, options = {}) {
  const { documentId, ...requestOptions } = options;
  const query = documentId ? `?${new URLSearchParams({ document_id: documentId })}` : "";
  return apiFetch(`/research/${encodeURIComponent(ticker)}${query}`, requestOptions);
}

export function dynamicResearch(path, options = {}) {
  return apiFetch(`/research/v2/${path}`, options);
}

export async function fetchAnnouncements({
  window = "24h",
  category = "all",
  hideRoutine = true,
  ticker = null,
  signal,
} = {}) {
  const params = new URLSearchParams({
    window,
    hide_routine: String(hideRoutine),
  });
  if (category && category !== "all") {
    params.set("category", category);
  }
  if (ticker) {
    params.set("ticker", ticker);
  }
  return apiFetch(`/announcements?${params}`, { signal });
}
