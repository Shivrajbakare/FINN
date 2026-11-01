"use client";

import { useEffect, useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "finn-theme";
const LEGACY_THEME_KEY = "finn_theme";
const THEME_CHANGE_EVENT = "finn-theme-change";

export const THEME_COLORS = {
  light: "#FAFBFC",
  dark: "#131A28",
};

export function getSystemTheme() {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme() {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) || window.localStorage.getItem(LEGACY_THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Storage access blocked or unavailable
  }
  return "system";
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  const resolved = theme === "system" ? getSystemTheme() : theme;
  root.style.colorScheme = resolved;

  // Update theme-color meta tag for mobile browser chrome
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLORS[resolved] || THEME_COLORS.dark);
}

export function setThemePreference(theme) {
  if (theme !== "light" && theme !== "dark" && theme !== "system") return false;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(LEGACY_THEME_KEY, theme);
  } catch {
    // localStorage blocked
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
  return true;
}

function subscribeTheme(callback) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (e) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) {
      applyTheme(getStoredTheme());
      callback();
    }
  };

  const handleCustom = () => callback();

  // Listen for OS system theme changes
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleMedia = () => {
    if (getStoredTheme() === "system") {
      applyTheme("system");
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_CHANGE_EVENT, handleCustom);
  mediaQuery.addEventListener("change", handleMedia);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, handleCustom);
    mediaQuery.removeEventListener("change", handleMedia);
  };
}

const serverSnapshot = () => "system";
const serverResolvedSnapshot = () => "dark";
const resolvedSnapshot = () => {
  const preference = getStoredTheme();
  return preference === "system" ? getSystemTheme() : preference;
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, serverSnapshot);
  const resolvedTheme = useSyncExternalStore(subscribeTheme, resolvedSnapshot, serverResolvedSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    // Quick toggle between light and dark
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setThemePreference(next);
  };

  return {
    theme,
    resolvedTheme,
    setTheme: setThemePreference,
    toggleTheme,
  };
}
