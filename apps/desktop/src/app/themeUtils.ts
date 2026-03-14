export type ThemeValue = "system" | "light" | "dark";

export function normalizeTheme(theme: string | undefined): ThemeValue {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return "system";
}
