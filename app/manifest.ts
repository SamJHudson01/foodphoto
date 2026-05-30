import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Food Photos",
    short_name: "Food Photos",
    description: "A personal food photo tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f2ea",
    theme_color: "#f7f2ea",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
