import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { IconAppearanceProvider } from "./icon-appearance.js";
import "@fontsource-variable/inter/wght.css";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IconAppearanceProvider><App /></IconAppearanceProvider>
  </StrictMode>,
);
