import assert from "node:assert/strict";
import { createZip, readZip, MAX_ARCHIVE, jsonBlob } from "../src/archive.js";
import {
  exportProjects,
  importProjects,
  fromLines,
  normalizeProjects,
} from "../src/project-data.js";
const now = "2026-11-02T10:00:00Z";
const project = {
  id: "p1",
  title: "Bord",
  status: "Planerat",
  tags: "Ek",
  notes: "Mått",
  link: "",
  created: now,
  updated: now,
  checklist: [{ id: "t1", text: "Kapa", done: true }],
  materials: [{ id: "m1", text: "Ek 2 meter", done: false }],
};
const file = {
  id: "f1",
  projectId: "p1",
  name: "ritning.pdf",
  type: "application/pdf",
  size: 3,
  created: now,
  blob: new Blob(["PDF"]),
};
const data = { projects: [project], files: [file] };
const zip = await exportProjects(data);
const restored = await importProjects(new File([zip], "backup.zip"));
assert.deepEqual(restored.projects, data.projects);
assert.equal(await restored.files[0].blob.text(), "PDF");
const legacy = {
  format: "jans-verkstad-projekt-backup-v1",
  projects: [project],
  files: [{ ...file, blob: undefined, data: btoa("PDF") }],
};
assert.equal(
  await (
    await importProjects(new File([JSON.stringify(legacy)], "old.json"))
  ).files[0].blob.text(),
  "PDF",
);
assert.deepEqual(
  fromLines("Kapa\nLimma", [{ id: "old", text: "Kapa", done: true }])[0],
  { id: "old", text: "Kapa", done: true },
);
assert.throws(() =>
  normalizeProjects({
    projects: [{ ...project, updated: { bad: 1 } }],
    files: [],
  }),
);
assert.throws(() =>
  normalizeProjects({ projects: [project], files: [file, { ...file }] }),
);
await assert.rejects(
  createZip([
    { name: "a", blob: new Blob(["x"]) },
    { name: "a", blob: new Blob(["y"]) },
  ]),
);
await assert.rejects(
  createZip([{ name: "big", blob: { size: MAX_ARCHIVE + 1 } }]),
);
const damaged = new Uint8Array(await zip.arrayBuffer());
damaged[43] ^= 1;
await assert.rejects(readZip(new Blob([damaged])));
const large = new Blob([new Uint8Array(25 * 1024 * 1024)]);
const big = {
  projects: [project],
  files: Array.from({ length: 8 }, (_, i) => ({
    ...file,
    id: "large-" + i,
    size: large.size,
    blob: large,
  })),
};
const bigZip = await exportProjects(big);
assert(bigZip.size > 200 * 1024 * 1024);
assert(bigZip.size < 201 * 1024 * 1024);
const bigRestored = await importProjects(new File([bigZip], "big.zip"));
assert.equal(bigRestored.files.length, 8);
assert.equal(bigRestored.files[7].blob.size, 25 * 1024 * 1024);
console.log(
  "PASS: ZIP round trip, legacy JSON, checklist retention, validation, CRC rejection and eight 25 MiB files (old JSON would exceed 250 MiB).",
);
