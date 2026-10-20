import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { supabaseVerifier } from "./auth";

const URL = "https://example.supabase.co";
const STUDENT = "00000000-0000-4000-8000-00000000a11c";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" };
  const verify = supabaseVerifier(URL, createLocalJWKSet({ keys: [jwk] }));
  const sign = (claims: Record<string, unknown> = {}, expires = "1h", key = privateKey) =>
    new SignJWT({ aud: "authenticated", iss: `${URL}/auth/v1`, sub: STUDENT, ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(key);
  return { verify, sign };
}

describe("Supabase token check (D-64, S-02)", () => {
  it("reads the student's ID from a valid token", async () => {
    const { verify, sign } = await setup();
    expect(await verify(await sign())).toBe(STUDENT);
  });

  it("refuses expired tokens, other projects, other audiences and other signers", async () => {
    const { verify, sign } = await setup();
    const stranger = (await generateKeyPair("ES256")).privateKey;
    expect(await verify(await sign({}, "-1m"))).toBeNull();
    expect(await verify(await sign({ iss: "https://other.supabase.co/auth/v1" }))).toBeNull();
    expect(await verify(await sign({ aud: "anon" }))).toBeNull();
    expect(await verify(await sign({}, "1h", stranger))).toBeNull();
    expect(await verify("not a token")).toBeNull();
  });
});
