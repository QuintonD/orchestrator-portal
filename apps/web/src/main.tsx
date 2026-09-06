import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { IconAppearanceProvider } from "./icon-appearance.js";
import "./styles.css";
import "./portal.css";
import "./refinement.css";
import "./sprites.css";
import "./beta.css";
import "./personal.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IconAppearanceProvider><App /></IconAppearanceProvider>
  </StrictMode>,
);
