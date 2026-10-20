/**
 * Keeps the sign-in session in the phone's secure storage (Android Keystore, D-74, NFR-09), so a
 * student signs in once per phone. Secure storage rejects values over about 2 KB and a session
 * can be larger, so each value is split into chunks: `key.n` holds the count, `key.0`… the parts.
 *
 * A development build made before expo-secure-store was added has no native module; then
 * `available()` is false and the app offers no sign-in instead of keeping tokens in plain storage.
 */

type SecureStore = typeof import("expo-secure-store");

const CHUNK = 1800;
let module: Promise<SecureStore | null> | undefined;

function secureStore(): Promise<SecureStore | null> {
  module ??= import("expo-secure-store")
    .then(async (m) => ((await m.isAvailableAsync()) ? m : null))
    .catch(() => null);
  return module;
}

/** Whether this build can keep a session safely (and so offer sign-in). */
export async function available(): Promise<boolean> {
  return (await secureStore()) !== null;
}

/** Secure store keys allow only letters, digits, ".", "-" and "_". */
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

async function removeChunks(store: SecureStore, key: string) {
  const count = Number((await store.getItemAsync(`${key}.n`)) ?? 0);
  for (let i = 0; i < count; i++) await store.deleteItemAsync(`${key}.${i}`);
  await store.deleteItemAsync(`${key}.n`);
}

/** The storage interface Supabase's client expects. */
export const sessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const store = await secureStore();
    if (!store) return null;
    const key = safe(name);
    const count = Number((await store.getItemAsync(`${key}.n`)) ?? 0);
    if (count === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await store.getItemAsync(`${key}.${i}`);
      if (part === null) return null; // half-written: treat as signed out
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(name: string, value: string): Promise<void> {
    const store = await secureStore();
    if (!store) return;
    const key = safe(name);
    await removeChunks(store, key);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await store.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await store.setItemAsync(`${key}.n`, String(count));
  },
  async removeItem(name: string): Promise<void> {
    const store = await secureStore();
    if (store) await removeChunks(store, safe(name));
  },
};
