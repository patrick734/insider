/** Read an environment variable, with an optional default. Throws if it's required and missing. */
export function env(name: string, fallback?: string): string {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing environment variable ${name}`);
}

export function envList(name: string, fallback = ""): string[] {
  return env(name, fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
