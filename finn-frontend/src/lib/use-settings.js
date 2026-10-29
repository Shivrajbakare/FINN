"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getSettingsSnapshot, subscribeSettings } from "./settings-store.mjs";

const serverSnapshot = () => null;

export function useSettings() {
  const snapshot = useSyncExternalStore(subscribeSettings, getSettingsSnapshot, serverSnapshot);
  return useMemo(() => snapshot === null ? null : JSON.parse(snapshot), [snapshot]);
}
