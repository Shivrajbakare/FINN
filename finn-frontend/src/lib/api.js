/**
 * FINN API Client
 *
 * Centralized API layer for all backend communication.
 * In development, proxies to localhost:8000 (FastAPI).
 * In production, this would point to the Railway URL.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`API error ${res.status}: ${error}`);
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
export async function fetchPortfolio() {
  return apiFetch("/portfolio");
}

export async function fetchStockDetail(ticker) {
  return apiFetch(`/portfolio/${encodeURIComponent(ticker)}`);
}

export async function fetchAlerts(volumeThreshold = 2.0, priceThreshold = 3.0) {
  const params = new URLSearchParams({
    volume_threshold: volumeThreshold.toString(),
    price_threshold: priceThreshold.toString(),
  });
  return apiFetch(`/alerts?${params}`);
}

export async function fetchAllCompanies() {
  return apiFetch("/companies");
}
