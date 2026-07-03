import { createHash } from "node:crypto";

import { isProductionLikeRuntime } from "@/lib/auth-secret";
import {
  DEFAULT_PUBLIC_SITE_URL,
  isVercelProductionRuntime,
} from "@/lib/runtime-url";

export const RESEND_API_KEY_ENV = "RESEND_API_KEY";
export const RESEND_AUTH_FROM_ENV = "RESEND_AUTH_FROM";
export const RESEND_AUTH_REPLY_TO_ENV = "RESEND_AUTH_REPLY_TO";

const RESEND_EMAILS_API_URL = "https://api.resend.com/emails";

type EnvLike = Record<string, string | undefined>;
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export type AuthEmailVerificationPolicy = "required" | "optional";

interface AuthEmailDeliveryPayload {
  email: string;
  env?: EnvLike;
  fetcher?: Fetcher;
  url: string;
  userId?: string;
}

interface ResendAuthEmailConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
}

interface AuthEmailContent {
  html: string;
  subject: string;
  text: string;
}

export function authEmailVerificationPolicy(
  env: EnvLike = process.env,
): AuthEmailVerificationPolicy {
  return isProductionLikeRuntime(env) ? "required" : "optional";
}

export function shouldRequireAuthEmailVerification(
  env: EnvLike = process.env,
): boolean {
  return authEmailVerificationPolicy(env) === "required";
}

export function sendAuthPasswordResetEmail({
  email,
  env = process.env,
  fetcher = fetch,
  url,
  userId,
}: AuthEmailDeliveryPayload): Promise<void> {
  const config = resolveResendAuthEmailConfig(env);
  const canonicalUrl = canonicalizeAuthEmailUrl(url, env);
  const content = buildPasswordResetEmail(canonicalUrl);

  return sendResendAuthEmail({
    category: "auth-password-reset",
    config,
    content,
    email,
    fetcher,
    url: canonicalUrl,
    userId,
  });
}

export function sendAuthVerificationEmail({
  email,
  env = process.env,
  fetcher = fetch,
  url,
  userId,
}: AuthEmailDeliveryPayload): Promise<void> {
  const config = resolveResendAuthEmailConfig(env);
  const canonicalUrl = canonicalizeAuthEmailUrl(url, env);
  const content = buildVerificationEmail(canonicalUrl);

  return sendResendAuthEmail({
    category: "auth-email-verification",
    config,
    content,
    email,
    fetcher,
    url: canonicalUrl,
    userId,
  });
}

export function resolveResendAuthEmailConfig(
  env: EnvLike = process.env,
): ResendAuthEmailConfig {
  const apiKey = configuredEnvValue(env[RESEND_API_KEY_ENV]);
  const from = configuredEnvValue(env[RESEND_AUTH_FROM_ENV]);
  const replyTo = configuredEnvValue(env[RESEND_AUTH_REPLY_TO_ENV]);

  if (!apiKey) {
    throw new Error(`Missing required environment variable: ${RESEND_API_KEY_ENV}`);
  }

  if (!from) {
    throw new Error(
      `Missing required environment variable: ${RESEND_AUTH_FROM_ENV}`,
    );
  }

  return { apiKey, from, replyTo };
}

export function canonicalizeAuthEmailUrl(
  value: string,
  env: EnvLike = process.env,
): string {
  const url = new URL(value);

  if (isVercelProductionRuntime(env)) {
    const canonical = new URL(DEFAULT_PUBLIC_SITE_URL);
    url.protocol = canonical.protocol;
    url.hostname = canonical.hostname;
    url.port = canonical.port;
    canonicalizeCallbackUrl(url, canonical);
  }

  return url.toString();
}

export function buildPasswordResetEmail(url: string): AuthEmailContent {
  const escapedUrl = escapeHtml(url);

  return {
    subject: "Reset your OverGarden password",
    text: [
      "Use this one-time link to set a new OverGarden password:",
      url,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>Use this one-time link to set a new OverGarden password.</p>",
      `<p><a href="${escapedUrl}">Reset password</a></p>`,
      `<p>If the button does not work, open this link: ${escapedUrl}</p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
    ].join(""),
  };
}

export function buildVerificationEmail(url: string): AuthEmailContent {
  const escapedUrl = escapeHtml(url);

  return {
    subject: "Verify your OverGarden email",
    text: [
      "Open this link to verify your OverGarden email address:",
      url,
      "",
      "If you did not create an OverGarden account, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>Open this link to verify your OverGarden email address.</p>",
      `<p><a href="${escapedUrl}">Verify email</a></p>`,
      `<p>If the button does not work, open this link: ${escapedUrl}</p>`,
      "<p>If you did not create an OverGarden account, you can ignore this email.</p>",
    ].join(""),
  };
}

async function sendResendAuthEmail({
  category,
  config,
  content,
  email,
  fetcher,
  url,
  userId,
}: {
  category: string;
  config: ResendAuthEmailConfig;
  content: AuthEmailContent;
  email: string;
  fetcher: Fetcher;
  url: string;
  userId?: string;
}): Promise<void> {
  const response = await fetcher(RESEND_EMAILS_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey(category, userId ?? email, url),
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      subject: content.subject,
      html: content.html,
      text: content.text,
      tags: [{ name: "category", value: category }],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Resend auth email delivery failed with status ${response.status}.`,
    );
  }
}

function configuredEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return undefined;

  const normalized = trimmed.toLowerCase();
  if (normalized.includes("change_me") || normalized.includes("...")) {
    return undefined;
  }

  return trimmed;
}

function idempotencyKey(category: string, identity: string, url: string): string {
  return [
    "overgarden",
    category,
    stableHash(identity).slice(0, 24),
    stableHash(url).slice(0, 24),
  ].join("/");
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalizeCallbackUrl(url: URL, canonical: URL): void {
  const callbackUrl = url.searchParams.get("callbackURL");
  if (!callbackUrl) return;

  const normalizedCallback = new URL(callbackUrl, canonical);
  normalizedCallback.protocol = canonical.protocol;
  normalizedCallback.hostname = canonical.hostname;
  normalizedCallback.port = canonical.port;

  url.searchParams.set("callbackURL", normalizedCallback.toString());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
