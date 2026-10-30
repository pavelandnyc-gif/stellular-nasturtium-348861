"use client";
import { useEffect } from "react";
import { installAudioUnlock } from "./voice";

export function ServiceWorker() {
  useEffect(() => {
    installAudioUnlock(); // el primer toque deja lista la voz de Jarvis (requisito de iOS)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
