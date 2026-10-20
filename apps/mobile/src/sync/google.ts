import { supabase, type AuthResult } from "./auth";
import { GOOGLE_WEB_CLIENT_ID } from "./config";

/**
 * Google sign-in (D-74, the main button): Android's own Google account picker gives an ID token,
 * and Supabase signs the student in with it. Nothing is typed and no password exists.
 * Needs the Android OAuth client in Google Cloud (package + signing key SHA-1) and the Web client
 * ID here; Supabase's Google provider has "Skip nonce checks" on for the native flow.
 *
 * Loaded on demand: a development build made before the library was added has no native module,
 * and then the button is simply not shown.
 */

type GoogleModule = typeof import("@react-native-google-signin/google-signin");
let loaded: Promise<GoogleModule | null> | undefined;

function google(): Promise<GoogleModule | null> {
  if (!GOOGLE_WEB_CLIENT_ID) return Promise.resolve(null);
  loaded ??= import("@react-native-google-signin/google-signin")
    .then((m) => {
      m.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, scopes: ["email", "profile"] });
      return m;
    })
    .catch(() => null);
  return loaded;
}

/** Whether to show "Continue with Google". */
export async function googleAvailable(): Promise<boolean> {
  return (await google()) !== null;
}

/** `cancelled` when the student closes the picker: not an error, nothing to show. */
export async function signInWithGoogle(): Promise<AuthResult | { ok: false; cancelled: true }> {
  const m = await google();
  if (!m) return { ok: false, message: "Google sign-in isn't available in this version." };
  try {
    await m.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await m.GoogleSignin.signIn();
    if (response.type !== "success") return { ok: false, cancelled: true };
    const idToken = response.data.idToken;
    if (!idToken)
      return { ok: false, message: "Google didn't confirm your account. Please try again." };
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });
    if (error) {
      console.warn("[google sign-in] supabase", error.status, error.message);
      return {
        ok: false,
        message: `Brokely couldn't sign you in with Google (${error.status ?? error.name}). Please try again.`,
      };
    }
    return { ok: true, session: data.session };
  } catch (error) {
    const code = String((error as { code?: string | number }).code ?? "");
    console.warn("[google sign-in]", code, (error as Error).message);
    if (code === m.statusCodes.SIGN_IN_CANCELLED) return { ok: false, cancelled: true };
    if (code === m.statusCodes.IN_PROGRESS) return { ok: false, cancelled: true };
    if (code === m.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return {
        ok: false,
        message: "Google sign-in needs Google Play services. Use email instead.",
      };
    }
    if (code === "10" || code === "DEVELOPER_ERROR") {
      // Google refused this app: the Android OAuth client's package or SHA-1 doesn't match.
      return {
        ok: false,
        message: "Google sign-in isn't set up for this version of the app yet (code 10).",
      };
    }
    if (code === "7" || code === "NETWORK_ERROR") {
      return { ok: false, message: "No internet connection. Try again when you're online." };
    }
    return {
      ok: false,
      message: `Google sign-in failed (code ${code || "unknown"}). Please try again.`,
    };
  }
}

/** On sign-out, forget the Google account choice too, so the picker asks again next time. */
export async function signOutOfGoogle(): Promise<void> {
  const m = await google();
  await m?.GoogleSignin.signOut().catch(() => undefined);
}
