import type { MetadataRoute } from "next";

// Web App Manifest. Next serves this at /manifest.webmanifest and injects the
// <link rel="manifest"> tag automatically. Colors are literal hex because the
// manifest spec requires it (this file is exempted from the no-hex lint gate).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OverGarden",
    short_name: "OverGarden",
    description:
      "Gardening journal + catalog-as-social-graph for Ukraine & Bulgaria.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
