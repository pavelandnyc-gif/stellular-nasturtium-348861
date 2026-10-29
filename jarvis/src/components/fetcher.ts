"use client";
import { toast } from "./Toast";

/** Llama a una ruta de la API. Si falla, muestra el error y lanza una excepción. */
export async function call<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    toast("Sin conexión. No se guardó el cambio.", "error");
    throw new Error("offline");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("auth");
  }
  if (!res.ok || data.ok === false) {
    const msg = data.error ?? `Error ${res.status}`;
    toast(msg, "error");
    throw new Error(msg);
  }
  return data as T;
}
