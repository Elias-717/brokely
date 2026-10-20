import "react-native-url-polyfill/auto";
import { createClient, type AuthError, type Session } from "@supabase/supabase-js";
import {
  CONFIRMED_URL,
  RESET_PASSWORD_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./config";
import { sessionStorage } from "./session-storage";

/**
 * Sign-in with Supabase Auth (D-64, D-74): Google first, email + password as the alternative.
 * The session lives in secure storage and is renewed quietly, so a student signs in once per
 * phone. Email confirmation is on (set in the Supabase dashboard).
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // links are handled by the reset-password screen
  },
});

export const MIN_PASSWORD = 8; // D-74; also set in the Supabase dashboard

export type AuthResult = { ok: true; session: Session | null } | { ok: false; message: string };

/**
 * Supabase's messages in Brokely's words. The full error goes to the developer console (Metro),
 * never to the screen; unknown ones show a short reference so a report can be traced.
 */
function explain(error: AuthError | Error): string {
  console.warn("[sign-in]", error.name, error.message);
  const text = error.message.toLowerCase();
  if (text.includes("invalid login credentials")) return "That email and password don't match.";
  if (text.includes("email not confirmed"))
    return "Please confirm your email first: open the link we sent you.";
  if (text.includes("already registered") || text.includes("already been registered"))
    return "There's already an account with this email. Sign in instead.";
  if (text.includes("password")) return `Use a password of at least ${MIN_PASSWORD} characters.`;
  if (text.includes("rate limit") || text.includes("too many"))
    return "Too many tries for now. Please wait a few minutes.";
  if (text.includes("network") || text.includes("fetch"))
    return "Brokely couldn't reach the sign-in server. Check your internet connection and try again.";
  if (text.includes("signups not allowed") || text.includes("signup is disabled"))
    return "New accounts are switched off at the moment.";
  if (text.includes("email address") && text.includes("invalid"))
    return "That email address doesn't look right.";
  const status = "status" in error && error.status ? ` ${error.status}` : "";
  return `Something went wrong (${error.name}${status}). Please try again.`;
}

const tidy = (email: string) => email.trim().toLowerCase();

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth
    .signInWithPassword({ email: tidy(email), password })
    .catch((e: Error) => ({ data: { session: null }, error: e }));
  return error ? { ok: false, message: explain(error) } : { ok: true, session: data.session };
}

/** A new account. With email confirmation on there is no session until the link is opened. */
export async function createAccount(email: string, password: string): Promise<AuthResult> {
  if (password.length < MIN_PASSWORD) {
    return { ok: false, message: `Use a password of at least ${MIN_PASSWORD} characters.` };
  }
  const { data, error } = await supabase.auth
    .signUp({ email: tidy(email), password, options: { emailRedirectTo: CONFIRMED_URL } })
    .catch((e: Error) => ({ data: { session: null }, error: e }));
  return error ? { ok: false, message: explain(error) } : { ok: true, session: data.session };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth
    .resetPasswordForEmail(tidy(email), { redirectTo: RESET_PASSWORD_URL })
    .catch((e: Error) => ({ error: e }));
  return error ? { ok: false, message: explain(error) } : { ok: true, session: null };
}

/** From the reset link: sign in with its tokens, then save the new password. */
export async function setNewPassword(
  tokens: { accessToken: string; refreshToken: string },
  password: string,
): Promise<AuthResult> {
  if (password.length < MIN_PASSWORD) {
    return { ok: false, message: `Use a password of at least ${MIN_PASSWORD} characters.` };
  }
  const set = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (set.error) return { ok: false, message: "This reset link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { ok: false, message: explain(error) } : { ok: true, session: set.data.session };
}

/** Forgets the session on this phone only, so it works offline too. */
export async function signOutHere(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const { signOutOfGoogle } = await import("./google");
  await signOutOfGoogle();
}
