// App.jsx
// Route determination: this app is rendered by FastAPI which serves
// the correct HTML page per route. Each HTML page bootstraps React
// and renders only the component it needs.
//
// If you use a proper SPA router (e.g. React Router), replace this
// with <Routes> / <Route> declarations. For now, each page entry
// can import and render its own component directly.

import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";

// Import the page you want to render (swap at build time per route)
// Examples:
//   import Page from "./pages/Login";
//   import Page from "./pages/GalleryDashboard";
//   import Page from "./pages/AdminDashboard";
//   import Page from "./pages/NotFound";

// Default: auto-detect by window.__PAGE__
import Login from "./pages/Login";
import GalleryDashboard from "./pages/GalleryDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";

const PAGE_MAP = {
  login:   Login,
  gallery: GalleryDashboard,
  admin:   AdminDashboard,
  "404":   NotFound,
};

export default function App() {
  // Each FastAPI route sets window.__PAGE__ in a <script> tag before
  // loading the React bundle. E.g.:
  //   return HTMLResponse('<script>window.__PAGE__="gallery"</script><div id="root">...')
  const pageKey = window.__PAGE__ || "login";
  const Page = PAGE_MAP[pageKey] || NotFound;

  return (
    <ThemeProvider>
      <Page />
    </ThemeProvider>
  );
}
