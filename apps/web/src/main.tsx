import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { IconAppearanceProvider } from "./icon-appearance.js";
import "@fontsource-variable/inter/wght.css";
import "./app.css";

// A standalone design preview, with no workspace requests or simulated work.
const AssistantMotionStudio = lazy(() => import("./assistant-motion-studio.js"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.pathname === "/assistant-motion"
      ? <Suspense fallback={<p>Loading motion studies…</p>}><AssistantMotionStudio /></Suspense>
      : <IconAppearanceProvider><App /></IconAppearanceProvider>}
  </StrictMode>,
);
