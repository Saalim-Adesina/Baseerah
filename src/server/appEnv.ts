/**
 * Which deployment environment this process is serving.
 *
 * One explicit variable, read the same way on Vercel, locally and in scripts.
 * Everything environment-dependent keys off this: the Polar organisation, its
 * credentials and its product catalogue.
 *
 * This module is server-only. `APP_ENV` is not a `VITE_` name, so it is never
 * inlined into the client bundle, and `vite.config.ts` importProtection turns an
 * accidental client import of `src/server/**` into a build error.
 */

export const APP_ENVS = ["production", "preview"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * Preview is the default on purpose: an unset or misspelled `APP_ENV` must fall
 * back to the sandbox, never to charging a real card. Production is opted into
 * explicitly. Local development is `preview`.
 */
export function appEnv(): AppEnv {
  return process.env["APP_ENV"] === "production" ? "production" : "preview";
}

export function isProductionEnv() {
  return appEnv() === "production";
}
