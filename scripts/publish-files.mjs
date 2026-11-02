// Copy a tested build into the repository root used by GitHub Pages.
import { cp, readdir, rm } from "node:fs/promises";
await rm("assets", { recursive: true, force: true });
for (const entry of await readdir("dist"))
  await cp("dist/" + entry, entry, { recursive: true });
console.log(
  "Updated GitHub Pages files from dist. Review the diff before committing.",
);
