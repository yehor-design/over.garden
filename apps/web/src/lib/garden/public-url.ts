import { getPublicSiteUrl } from "@/lib/runtime-url";

export function absolutePublicUrl(path: string, siteUrl = getPublicSiteUrl()) {
  return new URL(path, siteUrl).toString();
}
