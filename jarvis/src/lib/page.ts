import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { getProfile } from "./repo/profile";

/** Para páginas del servidor: exige sesión y devuelve usuario + perfil. */
export async function pageContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id, user.email);
  return { user, profile, tz: profile.timezone };
}
