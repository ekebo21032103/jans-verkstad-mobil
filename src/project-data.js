import { createZip, readZip, jsonBlob } from "./archive.js";
export const PROJECT_DB = "jans-verkstad-projekt-v1";
export const PHOTO_DB = "jans-verkstad-platsfoton-v1";
export const MAX_FILE = 25 * 1024 * 1024;
export function request(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export function completed(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        tx.error ||
          Error("Kunde inte spara. Kontrollera ledigt lagringsutrymme."),
      );
  });
}
export function openDB(name) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(Error("Stäng andra flikar med verkstaden och försök igen."));
    r.onupgradeneeded = () => {
      const d = r.result;
      if (name === PROJECT_DB) {
        d.createObjectStore("projects", { keyPath: "id" });
        d.createObjectStore("files", { keyPath: "id" }).createIndex(
          "byProject",
          "projectId",
          { unique: false },
        );
      } else d.createObjectStore("photos", { keyPath: "id" });
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
  });
}
export async function readProjects() {
  const db = await openDB(PROJECT_DB);
  try {
    const tx = db.transaction(["projects", "files"], "readonly"),
      done = completed(tx);
    const [projects, files] = await Promise.all([
      request(tx.objectStore("projects").getAll()),
      request(tx.objectStore("files").getAll()),
    ]);
    await done;
    return { projects, files };
  } finally {
    db.close();
  }
}
export async function readPhotos() {
  const db = await openDB(PHOTO_DB);
  try {
    const tx = db.transaction("photos", "readonly"),
      done = completed(tx),
      rows = await request(tx.objectStore("photos").getAll());
    await done;
    return rows;
  } finally {
    db.close();
  }
}
export async function writeProjects(data) {
  const db = await openDB(PROJECT_DB);
  try {
    const tx = db.transaction(["projects", "files"], "readwrite"),
      done = completed(tx);
    try {
      tx.objectStore("projects").clear();
      tx.objectStore("files").clear();
      for (const p of data.projects) tx.objectStore("projects").add(p);
      for (const f of data.files) tx.objectStore("files").add(f);
    } catch (error) {
      tx.abort();
      await done.catch(() => {});
      throw error;
    }
    await done;
  } finally {
    db.close();
  }
}
export async function writePhotos(rows) {
  const db = await openDB(PHOTO_DB);
  try {
    const tx = db.transaction("photos", "readwrite"),
      done = completed(tx);
    try {
      tx.objectStore("photos").clear();
      for (const row of rows) tx.objectStore("photos").add(row);
    } catch (error) {
      tx.abort();
      await done.catch(() => {});
      throw error;
    }
    await done;
  } finally {
    db.close();
  }
}
export function tasks(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 300)
    throw Error("En projektlista får ha högst 300 rader.");
  const ids = new Set();
  return value.map((t) => {
    if (
      !t ||
      typeof t.id !== "string" ||
      ids.has(t.id) ||
      typeof t.text !== "string" ||
      !t.text.trim() ||
      t.text.length > 500 ||
      typeof t.done !== "boolean"
    )
      throw Error("Ogiltig checklista eller materiallista.");
    ids.add(t.id);
    return { id: t.id, text: t.text, done: t.done };
  });
}
export function fromLines(text, previous = []) {
  const lines = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean),
    used = new Set();
  return tasks(
    lines.map((text) => {
      const old = previous.find((x) => x.text === text && !used.has(x.id));
      if (old) used.add(old.id);
      return old || { id: crypto.randomUUID(), text, done: false };
    }),
  );
}
export function normalizeProjects(data) {
  if (!data || !Array.isArray(data.projects) || !Array.isArray(data.files))
    throw Error("Ogiltig projektsäkerhetskopia.");
  const ids = new Set(),
    fileIds = new Set(),
    counts = new Map();
  const projects = data.projects.map((p) => {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      p.id.length > 200 ||
      ids.has(p.id) ||
      typeof p.title !== "string" ||
      !p.title.trim() ||
      p.title.length > 160
    )
      throw Error("Ogiltigt projekt i säkerhetskopian.");
    for (const k of ["created", "updated"])
      if (typeof p[k] !== "string" || !Number.isFinite(Date.parse(p[k])))
        throw Error("Ett projekt har ett ogiltigt datum.");
    for (const [k, max] of [
      ["tags", 240],
      ["notes", 12000],
      ["link", 2000],
    ])
      if (typeof p[k] !== "string" || p[k].length > max)
        throw Error("Ogiltiga projektuppgifter.");
    if (!["Idé", "Planerat", "Pågående", "Färdigt"].includes(p.status))
      throw Error("Ogiltig projektstatus.");
    if (p.link && !/^https?:$/.test(new URL(p.link).protocol))
      throw Error("Ogiltig projektlänk.");
    if (
      p.toolIds !== undefined &&
      (!Array.isArray(p.toolIds) ||
        p.toolIds.length > 300 ||
        p.toolIds.some((id) => typeof id !== "string" || id.length > 200))
    )
      throw Error("Ogiltiga verktygskopplingar.");
    ids.add(p.id);
    return {
      ...p,
      checklist: tasks(p.checklist),
      materials: tasks(p.materials),
    };
  });
  const files = data.files.map((f) => {
    const n = (counts.get(f?.projectId) || 0) + 1;
    counts.set(f?.projectId, n);
    if (
      !f ||
      typeof f.id !== "string" ||
      !f.id ||
      fileIds.has(f.id) ||
      !ids.has(f.projectId) ||
      !(f.blob instanceof Blob) ||
      f.blob.size > MAX_FILE ||
      n > 30 ||
      typeof f.name !== "string" ||
      f.name.length > 250 ||
      typeof f.type !== "string" ||
      !(
        f.type.startsWith("image/") ||
        f.type === "application/pdf" ||
        /\.pdf$/i.test(f.name)
      )
    )
      throw Error("Ogiltig bilaga i säkerhetskopian.");
    fileIds.add(f.id);
    return { ...f, size: f.blob.size };
  });
  return { projects, files };
}
export function projectEntries(data) {
  const normalized = normalizeProjects(data);
  return {
    metadata: {
      projects: normalized.projects,
      files: normalized.files.map(({ blob, ...f }, i) => ({
        ...f,
        path: "project-files/" + i,
      })),
    },
    entries: normalized.files.map((f, i) => ({
      name: "project-files/" + i,
      blob: f.blob,
    })),
  };
}
export async function decodeProjectEntries(metadata, entries) {
  if (!Array.isArray(metadata?.files))
    throw Error("Bilageförteckningen saknas.");
  return normalizeProjects({
    projects: metadata.projects,
    files: metadata.files.map((f) => {
      if (!entries.has(f.path)) throw Error("En projektbilaga saknas.");
      return { ...f, blob: entries.get(f.path).slice(0, undefined, f.type) };
    }),
  });
}
export async function exportProjects(data, progress) {
  const { metadata, entries } = projectEntries(data);
  return createZip(
    [
      {
        name: "manifest.json",
        blob: jsonBlob({
          format: "jans-project-zip-v1",
          exported: new Date().toISOString(),
          ...metadata,
        }),
      },
      ...entries,
    ],
    progress,
  );
}
export async function importProjects(file) {
  const signature = new DataView(
    await file.slice(0, 4).arrayBuffer(),
  ).getUint32(0, true);
  if (signature === 0x04034b50) {
    const entries = await readZip(file);
    const manifest = entries.get("manifest.json");
    if (!manifest) throw Error("Projektförteckning saknas.");
    const m = JSON.parse(await manifest.text());
    if (m.format !== "jans-project-zip-v1")
      throw Error(
        "Välj en projektsäkerhetskopia. Hela verkstaden återställs från startsidan.",
      );
    return decodeProjectEntries(m, entries);
  }
  if (file.size > 250 * 1024 * 1024)
    throw Error(
      "En äldre JSON-kopia får vara högst 250 MB. Använd ZIP för större säkerhetskopior.",
    );
  const raw = JSON.parse(await file.text());
  if (
    raw.format !== "jans-verkstad-projekt-backup-v1" ||
    !Array.isArray(raw.files)
  )
    throw Error("Detta är inte en projektsäkerhetskopia.");
  const files = raw.files.map((f) => {
    if (
      typeof f.data !== "string" ||
      f.data.length > Math.ceil(MAX_FILE / 3) * 4
    )
      throw Error("Ogiltig eller för stor bilaga.");
    const bin = atob(f.data),
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return {
      ...f,
      blob: new Blob([bytes], { type: f.type || "application/pdf" }),
    };
  });
  return normalizeProjects({ projects: raw.projects, files });
}
