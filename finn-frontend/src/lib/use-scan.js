"use client";

import { useEffect, useState } from "react";
import { fetchAlerts, fetchPortfolio } from "./api";
import { startPolling } from "./request-lifecycle.mjs";

export function useScan(kind, settings) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const key = settings === null ? null : JSON.stringify([
    kind, kind === "alerts" ? settings.volMultiplier : null,
    kind === "alerts" ? settings.priceChangeThreshold : null,
  ]);

  useEffect(() => {
    if (key === null) return;
    const [type, volume, price] = JSON.parse(key);
    return startPolling(
      (signal) => type === "portfolio"
        ? fetchPortfolio({ signal }) : fetchAlerts(volume, price, { signal }),
      (response) => setResult({ key, ...response }),
    );
  }, [key, revision]);

  // Hide old results immediately when thresholds change, before effects run.
  if (key === null || result?.key !== key) return { data: null, error: null, loading: true, refresh };
  return { ...result, loading: false, refresh };
}
