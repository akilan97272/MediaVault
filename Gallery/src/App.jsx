import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";
import Login from "./pages/Login";
import GalleryDashboard from "./pages/GalleryDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "./context/AuthContext";

const PAGE_MAP = {
  login:   Login,
  gallery: GalleryDashboard,
  admin:   AdminDashboard,
  "404":   NotFound,
};

export default function App() {
  function pageFromPath() {
    const p = window.location.pathname;
    if (p.startsWith("/gallery")) return "gallery";
    if (p.startsWith("/admin"))   return "admin";
    if (p === "/404")             return "404";
    return "login";
  }

  const pageKey = window.__PAGE__ || pageFromPath();
  const Page = PAGE_MAP[pageKey] || NotFound;

  return (
    <ThemeProvider>
      <AuthProvider>
        <Page />
      </AuthProvider>
    </ThemeProvider>
  );

}
