export function optionalServerEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function requiredServerEnv(name: string): string {
  const value = optionalServerEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function numberServerEnv(name: string, fallback: number): number {
  const value = optionalServerEnv(name);
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }
  return parsed;
}

export function booleanServerEnv(name: string, fallback = false): boolean {
  const value = optionalServerEnv(name);
  if (!value) return fallback;
  return value === "true" || value === "1";
}
