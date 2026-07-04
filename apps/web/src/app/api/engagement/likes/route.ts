import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { toggleAnonymousEngagementLike } from "@/server/engagement-repository";
import {
  parseEngagementReturnTo,
  parseEngagementTarget,
  redirectWithEngagementStatus,
} from "../shared";

const ANONYMOUS_ENGAGEMENT_COOKIE = "og_engagement_device";
const ANONYMOUS_ENGAGEMENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(ANONYMOUS_ENGAGEMENT_COOKIE)?.value;
  const anonymousToken = isReusableAnonymousToken(existingToken)
    ? existingToken
    : randomUUID();

  let result: Awaited<ReturnType<typeof toggleAnonymousEngagementLike>>;
  try {
    result = await toggleAnonymousEngagementLike({
      target,
      anonymousToken,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Anonymous engagement rate limit reached."
    ) {
      const response = redirectWithEngagementStatus(
        request,
        returnTo,
        "like-rate-limited",
      );
      response.cookies.set({
        name: ANONYMOUS_ENGAGEMENT_COOKIE,
        value: anonymousToken,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ANONYMOUS_ENGAGEMENT_MAX_AGE_SECONDS,
      });
      return response;
    }
    throw error;
  }

  revalidatePath(new URL(returnTo, request.url).pathname);
  const response = redirectWithEngagementStatus(
    request,
    returnTo,
    result.liked ? "liked" : "unliked",
  );

  response.cookies.set({
    name: ANONYMOUS_ENGAGEMENT_COOKIE,
    value: anonymousToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANONYMOUS_ENGAGEMENT_MAX_AGE_SECONDS,
  });

  return response;
}

function isReusableAnonymousToken(value: string | undefined): value is string {
  return Boolean(value && value.length >= 16 && value.length <= 256);
}
