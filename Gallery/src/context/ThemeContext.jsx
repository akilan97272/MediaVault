import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();
const THEME_ORDER = ["dark", "light", "refresh"];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("mv-theme");
    return THEME_ORDER.includes(stored) ? stored : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mv-theme", theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, themeOrder: THEME_ORDER }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
