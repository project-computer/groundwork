import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { initI18n } from "./lib/i18n";
import "@/index.css";

// Load the user's locale catalog before the first paint so a Thai session
// never flashes English.
void initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
