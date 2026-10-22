import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vino Nota",
    short_name: "Vino Nota",
    description: "A private wine field journal.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3eee3",
    theme_color: "#f3eee3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
