import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/** Reads the student's ID from a sign-in token, or null when the token isn't valid. */
export type VerifyToken = (token: string) => Promise<string | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks Supabase access tokens (D-64). The project signs them with an asymmetric key (ES256),
 * so the API needs only the public key set, never a secret. The student's ID is the token's
 * `sub`; the API never takes it from the request (S-02).
 */
export function supabaseVerifier(supabaseUrl: string, keys?: JWTVerifyGetKey): VerifyToken {
  const issuer = `${supabaseUrl}/auth/v1`;
  const keySet = keys ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keySet, {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256"],
      });
      return typeof payload.sub === "string" && UUID.test(payload.sub) ? payload.sub : null;
    } catch {
      return null; // expired, wrong signer, wrong project…
    }
  };
}
