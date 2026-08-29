import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import MiniMode from "./MiniMode";
import "./styles.css";
import "./modern-ui.css";

// Détection fiable : le nom de la fenêtre elle-même, pas un paramètre d'URL.
const isMini = getCurrentWindow().label === "mini";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isMini ? <MiniMode /> : <App />}</React.StrictMode>
);
