"use client";
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowser(url: string, key: string) {
  return createBrowserClient(url, key);
}
