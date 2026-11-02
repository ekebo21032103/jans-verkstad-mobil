import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
export default defineConfig({
  root: "web",
  publicDir: "../public",
  base: "./",
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        [
          "index",
          "start",
          "projekt-ritningar",
          "forvaringsplatser-bilder",
          "verkstadsoversikt",
        ].map((name) => [name, resolve("web", name + ".html")]),
      ),
    },
  },
  plugins: [
    {
      name: "offline-cache",
      closeBundle() {
        const files = [];
        function walk(dir) {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = dir + "/" + entry.name;
            if (entry.isDirectory()) walk(path);
            else if (!entry.name.startsWith("."))
              files.push("./" + path.slice("dist/".length));
          }
        }
        walk("dist");
        files.sort();
        const hash = createHash("sha256");
        for (const path of files) {
          hash.update(path);
          hash.update(readFileSync("dist/" + path.slice(2)));
        }
        const cache = "jans-verkstad-app-" + hash.digest("hex").slice(0, 16);
        const source = readFileSync("scripts/sw-template.js", "utf8")
          .replace("__CACHE_NAME__", JSON.stringify(cache))
          .replace("__CACHE_FILES__", JSON.stringify(files));
        writeFileSync("dist/sw.js", source);
        writeFileSync("dist/.nojekyll", "");
      },
    },
  ],
});
