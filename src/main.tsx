import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BuddyApp } from "./buddy/BuddyApp";
import "./styles.css";
import { ErrorBoundary } from "./ui/ErrorBoundary";

// The island never needs the browser context menu.
window.addEventListener("contextmenu", (e) => {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
});

const isBuddy = window.location.hash === "#buddy";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>{isBuddy ? <BuddyApp /> : <App />}</ErrorBoundary>
  </StrictMode>,
);
