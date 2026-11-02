import assert from "node:assert/strict";
import { indexedDB, IDBObjectStore } from "fake-indexeddb";
Object.assign(globalThis, { indexedDB, window: new EventTarget() });
const { api, moveItems, restoreBackup, exportBackup, validateBackup } =
  await import("../src/local-api");
const { readProjects, writeProjects, readPhotos, writePhotos } =
  await import("../src/project-data.js");
const { snapshotWorkshop, exportWorkshop, importWorkshop, restoreWorkshop } =
  await import("../src/workshop-backup");
const date = "2026-11-02T12:00:00Z",
  photo = "data:image/jpeg;base64,AA==";
const tool = {
  id: "i1",
  name: "Såg",
  location: "Låda 1",
  quantity: 1,
  category: "Elverktyg",
  keywords: "",
  notes: "",
  photo,
  updated: date,
  brand: "Festool",
  model: "TS55",
  serial: "123",
  manualUrl: "https://example.test/manual",
  custom: { keep: true },
};
const places = [
  { id: "p1", name: "Låda 1" },
  { id: "p2", name: "Låda 2" },
];
await restoreBackup({
  items: [tool, { ...tool, id: "i2", name: "Hyvel" }],
  places,
});
await api("/api/items", {
  method: "POST",
  body: JSON.stringify({
    id: "i1",
    name: "Såg",
    location: "Låda 1",
    quantity: 1,
  }),
});
let items = await api("/api/items");
assert.equal(items.find((i: any) => i.id === "i1").serial, "123");
assert.deepEqual(items.find((i: any) => i.id === "i1").custom, { keep: true });
const before = validateBackup(await exportBackup());
await assert.rejects(moveItems(["i1", "missing"], "Ny plats"));
assert.deepEqual(validateBackup(await exportBackup()), before);
assert.equal(await moveItems(["i1", "i2"], "låda 2"), 2);
items = await api("/api/items");
for (const i of items) {
  assert.equal(i.location, "Låda 2");
  assert.equal(i.photo, photo);
  assert.equal(i.serial, "123");
}
assert.equal((await api("/api/places")).length, 2);
await assert.rejects(
  api("/api/items", {
    method: "POST",
    body: JSON.stringify({
      ...items[0],
      loan: { borrower: "Anna", lentOn: "2026-11-02", dueOn: "2026-11-01" },
    }),
  }),
);
const loan = { borrower: "Anna", lentOn: "2026-11-02", dueOn: "2026-11-12" };
await api("/api/items", {
  method: "POST",
  body: JSON.stringify({ ...items[0], loan }),
});
let record = validateBackup(await exportBackup());
assert.deepEqual(record.items.find((i) => i.id === items[0].id)?.loan, loan);
const p = {
  id: "project",
  title: "Bord",
  status: "Pågående",
  tags: "Ek",
  notes: "",
  link: "",
  created: date,
  updated: date,
  checklist: [{ id: "c", text: "Såga", done: true }],
  materials: [{ id: "m", text: "Ek", done: false }],
};
await writeProjects({
  projects: [p],
  files: [
    {
      id: "f",
      projectId: p.id,
      name: "drawing.pdf",
      type: "application/pdf",
      created: date,
      size: 3,
      blob: new Blob(["PDF"]),
    },
  ],
});
await writePhotos([
  { id: "p2", name: "Låda 2", dataUrl: photo, updated: date },
]);
const snapshot = await snapshotWorkshop(),
  backup = await exportWorkshop(snapshot),
  incoming = await importWorkshop(new File([backup], "all.zip"));
assert.deepEqual(incoming.register.items, snapshot.register.items);
assert.deepEqual(incoming.photos, snapshot.photos);
assert.equal(await incoming.projects.files[0].blob.text(), "PDF");
await restoreBackup({ items: [], places: [] });
await writeProjects({ projects: [], files: [] });
await writePhotos([]);
await restoreWorkshop(incoming, await snapshotWorkshop());
assert.equal((await api("/api/items")).length, 2);
assert.equal((await readProjects()).projects.length, 1);
assert.equal((await readPhotos()).length, 1);
// Force a write failure in the second database and verify cross-database rollback.
const saved = await snapshotWorkshop(),
  original = IDBObjectStore.prototype.add;
IDBObjectStore.prototype.add = function (value: any, ...args: any[]) {
  if (this.name === "photos" && value.name === "FAIL")
    throw Error("Simulated quota failure");
  return original.call(this, value, ...args);
};
await assert.rejects(
  restoreWorkshop(
    {
      ...incoming,
      projects: { projects: [], files: [] },
      photos: [{ id: "bad", name: "FAIL", dataUrl: photo }],
    },
    saved,
  ),
);
IDBObjectStore.prototype.add = original;
assert.deepEqual(
  (await snapshotWorkshop()).register.items,
  saved.register.items,
);
assert.equal((await readProjects()).projects.length, 1);
assert.equal((await readPhotos())[0].name, "Låda 2");
console.log(
  "PASS: atomic mass move, preservation of photos/metadata, loan validation, complete backup/restore and rollback after a database write failure.",
);
