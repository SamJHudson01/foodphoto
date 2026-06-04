import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SamApp",
    short_name: "SamApp",
    description: "A private personal evidence tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f2ea",
    theme_color: "#f7f2ea",
    orientation: "portrait",
    icons: [
      {
        src: "/sam.jpeg",
        sizes: "1024x1024",
        type: "image/jpeg",
        purpose: "any"
      }
    ]
  };
}
