import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// רישום service worker - רק בפרודקשן, כדי לא להפריע ל-HMR בפיתוח
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("רישום service worker נכשל:", err);
    });
  });
}
