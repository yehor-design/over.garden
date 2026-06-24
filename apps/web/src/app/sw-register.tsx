"use client";

import { useEffect } from "react";

// Registers the empty service worker (public/sw.js) on the client. This is the
// only client-side concern of the PWA carcass; all rendering stays server-side.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[sw] registration failed", error);
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
