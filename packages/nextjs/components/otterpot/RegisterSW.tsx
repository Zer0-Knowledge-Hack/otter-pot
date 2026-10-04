"use client";

import { useEffect } from "react";

async function nukeServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(r => r.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
}

export function RegisterSW() {
  useEffect(() => {
    // En desarrollo el SW rompe HMR
    if (process.env.NODE_ENV !== "production") {
      void nukeServiceWorkers();
      return;
    }

    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(reg => {
        reg.update().catch(() => undefined);
      })
      .catch(err => {
        console.warn("SW registration failed", err);
      });
  }, []);

  return null;
}
