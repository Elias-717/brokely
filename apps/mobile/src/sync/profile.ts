import type { Session } from "@supabase/supabase-js";

/**
 * What the account tells us about the student (S13h, S13j). Google sign-in brings a photo and a
 * name; an email account has neither. Shown only in the app on this phone.
 */
type Meta = { avatar_url?: unknown; picture?: unknown; full_name?: unknown; name?: unknown };

const meta = (session: Session | null): Meta => (session?.user.user_metadata ?? {}) as Meta;
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export function accountPhoto(session: Session | null): string | null {
  const m = meta(session);
  return str(m.avatar_url) ?? str(m.picture);
}

/** "Elias" from "Elias Al-Sumairi": a friendly default for "What Brokely calls you" (D-34). */
export function accountFirstName(session: Session | null): string | null {
  const m = meta(session);
  return (str(m.full_name) ?? str(m.name))?.split(/\s+/)[0] ?? null;
}

export function signedInWith(session: Session | null): "Google" | "email" | null {
  if (!session) return null;
  return session.user.app_metadata?.provider === "google" ? "Google" : "email";
}
