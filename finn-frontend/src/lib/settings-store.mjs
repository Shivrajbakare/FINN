export const SETTINGS_KEY = "finn_settings";
export const DEFAULT_SETTINGS = Object.freeze({ volMultiplier: 2, priceChangeThreshold: 3 });
const SETTINGS_EVENT = "finn-settings-changed";

export function normalizeSettings(value) {
  const valid = (number, min, max) => typeof number === "number" && Number.isFinite(number) && number >= min && number <= max;
  return {
    volMultiplier: valid(value?.volMultiplier, 1.5, 5) ? value.volMultiplier : DEFAULT_SETTINGS.volMultiplier,
    priceChangeThreshold: valid(value?.priceChangeThreshold, 1, 10) ? value.priceChangeThreshold : DEFAULT_SETTINGS.priceChangeThreshold,
  };
}

export function readSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// A primitive snapshot remains stable until the settings actually change.
export function getSettingsSnapshot() {
  try {
    return JSON.stringify(readSettings(window.localStorage));
  } catch {
    return JSON.stringify(DEFAULT_SETTINGS);
  }
}

export function subscribeSettings(callback) {
  const onStorage = (event) => {
    if (event.key === SETTINGS_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SETTINGS_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SETTINGS_EVENT, callback);
  };
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    return true;
  } catch {
    return false;
  }
}
