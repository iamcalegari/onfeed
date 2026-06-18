import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "onFeed",
    short_name: "onFeed",
    description: "Diga o que você tem em casa. A receita aparece na hora.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf4e8",
    theme_color: "#162f25",
    orientation: "portrait-primary",
    lang: "pt-BR",
    categories: ["food", "lifestyle"],
    icons: [
      {
        src: "/app-icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
