/**
 * Where the app finds its account and sync servers (D-64, D-71). All of these are public by
 * design: the publishable key only lets the app ask Supabase to sign someone in, and the sync
 * API checks every request's sign-in token itself. Secrets never live in the app.
 */
export const SUPABASE_URL = "https://swkakkylbsewewulxgra.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lD4FsDqn69ONvUXGlWi3uQ_MzSHsTjW";
export const SYNC_API_URL =
  "https://brokely-api.ashyglacier-36b03c11.eastasia.azurecontainerapps.io";

/** Google sign-in (D-74): the Web client ID from Google Cloud. Empty hides the Google button. */
export const GOOGLE_WEB_CLIENT_ID =
  "555438894045-97apg6l4glru5hv56ed8v84btkk45pr2.apps.googleusercontent.com";

/**
 * Where the emails send the student back to. Both must be in Supabase → Authentication →
 * URL Configuration → Redirect URLs, or Supabase falls back to its Site URL.
 */
export const RESET_PASSWORD_URL = "brokely://reset-password";
export const CONFIRMED_URL = "brokely://sign-in";
