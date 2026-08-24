const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function unknownApiRoute(request: Request): Response {
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 404,
      headers: NO_STORE_HEADERS,
    });
  }

  return Response.json(
    { error: "not_found" },
    {
      status: 404,
      headers: NO_STORE_HEADERS,
    },
  );
}

export function GET(request: Request): Response {
  return unknownApiRoute(request);
}

export function POST(request: Request): Response {
  return unknownApiRoute(request);
}

export function PUT(request: Request): Response {
  return unknownApiRoute(request);
}

export function PATCH(request: Request): Response {
  return unknownApiRoute(request);
}

export function DELETE(request: Request): Response {
  return unknownApiRoute(request);
}

export function OPTIONS(request: Request): Response {
  return unknownApiRoute(request);
}

export function HEAD(request: Request): Response {
  return unknownApiRoute(request);
}
