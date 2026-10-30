import { NextResponse } from "next/server";
import { authMode } from "@/lib/env";
import { LOCAL_COOKIE } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST() {
  if (authMode() === "supabase") {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(LOCAL_COOKIE);
  return res;
}
