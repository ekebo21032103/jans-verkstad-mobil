import { readdir, readFile, writeFile } from "node:fs/promises";
import { createZip } from "../src/archive.js";
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
for (const dir of ["src", "web", "public", "scripts", "tests", "docs"])
  await walk(dir);
files.push(
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.mjs",
  "README.md",
  ".gitignore",
  ".env.example",
);
const zip = await createZip(
  await Promise.all(
    files
      .sort()
      .map(async (name) => ({ name, blob: new Blob([await readFile(name)]) })),
  ),
);
await writeFile(
  "dist/source-code.zip",
  new Uint8Array(await zip.arrayBuffer()),
);
console.log(
  "Created source-code.zip from the current tracked application sources.",
);
