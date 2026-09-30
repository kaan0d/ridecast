import { defineConfig, type Plugin } from "vite";

// The default base map is the vector one (ui/layers.ts), whose MapLibre chunk is loaded on demand
// once the app runs. Listing it in the page lets the browser fetch it alongside the main script;
// a preconnect opens the connection for the Stadia style, tiles and fonts.
function preloadVectorMap(): Plugin {
  return {
    name: "preload-vector-map",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      const chunk = Object.values(ctx.bundle ?? {}).find((c) => c.type === "chunk" && c.facadeModuleId?.endsWith("/ui/vectorMap.ts"));
      if (!chunk || chunk.type !== "chunk") return [];
      return [
        { tag: "link", attrs: { rel: "preconnect", href: "https://tiles.stadiamaps.com", crossorigin: true }, injectTo: "head" },
        { tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `./${chunk.fileName}` }, injectTo: "head" },
        ...[...(chunk.viteMetadata?.importedCss ?? [])].map((css) => ({ tag: "link", attrs: { rel: "preload", as: "style", crossorigin: true, href: `./${css}` }, injectTo: "head" as const })),
      ];
    },
  };
}

// Relative asset paths, so the build works under any sub-path (kaandinc.com/ridecast/).
export default defineConfig({ base: "./", plugins: [preloadVectorMap()] });
