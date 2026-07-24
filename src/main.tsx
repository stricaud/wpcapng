import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// After a redeploy, an open tab may hold an old index that references code-split
// chunks the server no longer has. Reload once to fetch the fresh build instead
// of throwing a "failed to load dynamically imported module" error.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
