import { useEffect } from "react";
import type { Settings } from "./schemas";

export function useTheme(theme?: Settings["theme"]) {
  useEffect(() => {
    if (!theme) return;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme !== "light" && media.matches));
      document.querySelector("meta[name=theme-color]")?.setAttribute("content", getComputedStyle(document.body).backgroundColor);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
