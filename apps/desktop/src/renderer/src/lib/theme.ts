export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "horizon_theme_preference";

/**
 * Resolves whether dark class should be active on documentElement based on theme mode.
 */
export function applyTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch (err) {
    console.warn("Failed to persist theme preference:", err);
  }

  if (mode === "dark") {
    document.documentElement.classList.add("dark");
  } else if (mode === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    // system preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
}

/**
 * Retrieves the persisted theme preference, defaulting to "dark".
 */
export function getSavedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch (err) {
    console.warn("Failed to read theme preference:", err);
  }
  return "dark";
}

/**
 * Initializes theme on app startup and subscribes to OS color scheme changes.
 */
export function initTheme(): () => void {
  const currentTheme = getSavedTheme();
  applyTheme(currentTheme);

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemChange = () => {
    const active = getSavedTheme();
    if (active === "system") {
      applyTheme("system");
    }
  };

  mediaQuery.addEventListener("change", handleSystemChange);
  return () => {
    mediaQuery.removeEventListener("change", handleSystemChange);
  };
}
