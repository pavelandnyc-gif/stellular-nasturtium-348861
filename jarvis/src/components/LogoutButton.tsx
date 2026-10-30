"use client";
import { call } from "./fetcher";

export function LogoutButton() {
  return (
    <button
      className="btn btn-danger text-sm"
      onClick={async () => {
        await call("/api/auth/logout", "POST").catch(() => {});
        window.location.href = "/login";
      }}
    >
      Cerrar sesión
    </button>
  );
}
