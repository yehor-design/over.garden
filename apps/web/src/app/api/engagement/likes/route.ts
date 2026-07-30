import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  capabilityCookieName,
  issueAnonymousLikeCapability,
  verifyAnonymousLikeCapability,
} from "@/server/anonymous-like-capability";
import { toggleAnonymousEngagementLike } from "@/server/engagement-repository";
import { isInteractionAdmissionError } from "@/server/interaction-admission";
import {
  parseEngagementReturnTo,
  parseEngagementTarget,
  redirectWithEngagementStatus,
} from "../shared";

const LEGACY_ANONYMOUS_ENGAGEMENT_COOKIE = "og_engagement_device";

export async function POST(request: Request) {
  const formData = await request.formData();
  const target = parseEngagementTarget(formData);
  const returnTo = parseEngagementReturnTo(formData, target);
  const cookieStore = await cookies();
  const capabilityCookie = capabilityCookieName(target);
  const existingToken = cookieStore.get(capabilityCookie)?.value;
  const capability =
    verifyAnonymousLikeCapability(existingToken, target) ??
    issueAnonymousLikeCapability(target);

  let result: Awaited<ReturnType<typeof toggleAnonymousEngagementLike>>;
  try {
    result = await toggleAnonymousEngagementLike({
      target,
      anonymousToken: capability.token,
      capabilityExpiresAt: capability.expiresAt,
    });
  } catch (error) {
    if (isInteractionAdmissionError(error)) {
      const response = redirectWithEngagementStatus(
        request,
        returnTo,
        error.failure === "quota"
          ? "like-rate-limited"
          : "interaction-unavailable",
      );
      setCapabilityCookies(response, capabilityCookie, capability);
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

  setCapabilityCookies(response, capabilityCookie, capability);

  return response;
}

function setCapabilityCookies(
  response: ReturnType<typeof redirectWithEngagementStatus>,
  name: string,
  capability: { token: string; expiresAt: Date },
) {
  response.cookies.set({
    name,
    value: capability.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/engagement/likes",
    maxAge: Math.max(
      1,
      Math.floor((capability.expiresAt.getTime() - Date.now()) / 1000),
    ),
  });
  response.cookies.set({
    name: LEGACY_ANONYMOUS_ENGAGEMENT_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
