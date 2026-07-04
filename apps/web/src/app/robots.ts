import type { MetadataRoute } from "next";

import { absolutePublicUrl } from "@/lib/garden/public-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: absolutePublicUrl("/sitemap.xml"),
  };
}
