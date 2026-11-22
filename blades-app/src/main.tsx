import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";
import { TABS, useUi } from "./store/ui";

// ?tab=gear opens that tab at start (screenshots, shortcuts)
const tab = new URLSearchParams(location.search).get("tab");
if (TABS.some((x) => x === tab)) useUi.setState({ tab: tab as (typeof TABS)[number] });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
