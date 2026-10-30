"use client";
import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ mode, next, supabaseUrl, supabaseKey }: { mode: "supabase" | "local"; next: string; supabaseUrl: string; supabaseKey: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "supabase") {
        const supabase = createSupabaseBrowser(supabaseUrl, supabaseKey);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
      } else {
        const res = await fetch("/api/auth/local-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "No se pudo iniciar sesión.");
      }
      // Recarga completa para que el servidor lea la nueva sesión.
      const check = await fetch("/api/push/status");
      if (check.status === 401) {
        throw new Error("Tu cuenta existe, pero este correo no está autorizado (ALLOWED_EMAILS).");
      }
      window.location.href = next;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      {mode === "supabase" && (
        <input className="field" type="email" autoComplete="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
      )}
      <input
        className="field"
        type="password"
        autoComplete="current-password"
        placeholder={mode === "local" ? "Contraseña de la vista previa" : "Contraseña"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
      {mode === "local" && <p className="text-center text-xs text-muted">Modo local de prueba (sin Supabase)</p>}
    </form>
  );
}
