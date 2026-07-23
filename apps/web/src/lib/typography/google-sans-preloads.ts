import { preload } from "react-dom";

import { GOOGLE_SANS_PRELOAD_ASSETS } from "./google-sans-runtime";

export function GoogleSansPreloads(): null {
  preloadGoogleSans();

  return null;
}

export function preloadGoogleSans(): void {
  for (const asset of GOOGLE_SANS_PRELOAD_ASSETS) {
    preload(asset.publicPath, {
      as: "font",
      type: asset.contentType,
      crossOrigin: "anonymous",
      referrerPolicy: "no-referrer",
    });
  }
}
