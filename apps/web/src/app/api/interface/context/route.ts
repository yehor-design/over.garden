import { NextResponse } from "next/server";

import {
  INTERFACE_API_CACHE_CONTROL,
  isForbiddenInterfaceSubrequest,
} from "@/lib/interface-request-guard";
import { getRequestInterfaceLocalization } from "@/server/interface-localization";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.search || isForbiddenInterfaceSubrequest(request.headers)) {
    return response(null, 400);
  }

  const { market, locale } = await getRequestInterfaceLocalization();
  return NextResponse.json(
    { market, locale },
    {
      headers: {
        "Cache-Control": INTERFACE_API_CACHE_CONTROL,
      },
    },
  );
}

function response(body: BodyInit | null, status: number) {
  return new NextResponse(body, {
    status,
    headers: { "Cache-Control": INTERFACE_API_CACHE_CONTROL },
  });
}
