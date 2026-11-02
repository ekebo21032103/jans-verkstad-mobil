import { exportBackup, validateBackup, restoreBackup } from "./local-api";
import { createZip, readZip, jsonBlob } from "./archive.js";
import {
  readProjects,
  readPhotos,
  writeProjects,
  writePhotos,
  projectEntries,
  decodeProjectEntries,
} from "./project-data.js";
export async function snapshotWorkshop() {
  const [register, projects, photos] = await Promise.all([
    exportBackup(),
    readProjects(),
    readPhotos(),
  ]);
  return { register: JSON.parse(register), projects, photos };
}
type Snapshot = Awaited<ReturnType<typeof snapshotWorkshop>>;
export async function exportWorkshop(
  snapshot: Snapshot,
  progress: (done: number, total: number) => void = () => {},
) {
  const { metadata, entries } = projectEntries(snapshot.projects);
  return createZip(
    [
      {
        name: "manifest.json",
        blob: jsonBlob({
          format: "jans-workshop-zip-v1",
          exported: new Date().toISOString(),
          register: snapshot.register,
          projects: metadata,
          photos: snapshot.photos,
        }),
      },
      ...entries,
    ],
    progress,
  );
}
export async function importWorkshop(file: File): Promise<Snapshot> {
  const entries = await readZip(file),
    manifest = entries.get("manifest.json");
  if (!manifest) throw Error("Säkerhetskopians förteckning saknas.");
  const raw = JSON.parse(await manifest.text());
  if (raw.format !== "jans-workshop-zip-v1")
    throw Error(
      "Välj en säkerhetskopia av hela verkstaden. Äldre kopior importeras i respektive del.",
    );
  const register = validateBackup(JSON.stringify(raw.register));
  const projects = await decodeProjectEntries(raw.projects, entries);
  if (!Array.isArray(raw.photos))
    throw Error("Platsbilderna saknas i förteckningen.");
  const ids = new Set();
  const photos = raw.photos.map((p: any) => {
    if (
      !p ||
      typeof p.id !== "string" ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      typeof p.dataUrl !== "string" ||
      p.dataUrl.length > 9 * 1024 * 1024 ||
      !/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(p.dataUrl)
    )
      throw Error("Ogiltig platsbild i säkerhetskopian.");
    ids.add(p.id);
    return p;
  });
  return { register, projects, photos };
}
export async function restoreWorkshop(incoming: Snapshot, before: Snapshot) {
  // IndexedDB cannot transact across databases. Keep a rollback snapshot and restore
  // the register last. The UI also requires a downloadable recovery copy first.
  try {
    await writeProjects(incoming.projects);
    await writePhotos(incoming.photos);
    await restoreBackup(incoming.register);
  } catch (error) {
    const rolledBack = await Promise.allSettled([
      writeProjects(before.projects),
      writePhotos(before.photos),
      restoreBackup(before.register),
    ]);
    if (rolledBack.some((r) => r.status === "rejected"))
      throw Error(
        "Återställningen avbröts och kunde inte rullas tillbaka helt. Behåll den nedladdade återställningskopian. Frigör lagringsutrymme och återställ den.",
      );
    throw Error(
      "Återställningen misslyckades. Tidigare uppgifter har lagts tillbaka. " +
        (error as Error).message,
    );
  }
}
