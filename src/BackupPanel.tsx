import { useState } from "react";
import { download } from "./archive.js";
import {
  snapshotWorkshop,
  exportWorkshop,
  importWorkshop,
  restoreWorkshop,
} from "./workshop-backup";
type Snapshot = Awaited<ReturnType<typeof snapshotWorkshop>>;
const LAST = "jans-workshop-last-export-v1";
function lastExport() {
  try {
    return localStorage.getItem(LAST) || "";
  } catch {
    return "";
  }
}
export default function BackupPanel({
  onRestored,
}: {
  onRestored: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [last, setLast] = useState(lastExport),
    [incoming, setIncoming] = useState<Snapshot | null>(null),
    [recovery, setRecovery] = useState<Snapshot | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    const snapshot = await snapshotWorkshop();
    const blob = await exportWorkshop(snapshot, (n, total) =>
      setMessage(
        "Förbereder säkerhetskopia: " + n + " av " + total + " filer …",
      ),
    );
    download(
      blob,
      "jans-hela-verkstaden-" + new Date().toISOString().slice(0, 10) + ".zip",
    );
    const date = new Date().toISOString();
    setLast(date);
    try {
      localStorage.setItem(LAST, date);
    } catch {}
    setMessage(
      "Nedladdningen har startats. Kontrollera att ZIP-filen har sparats i Filer eller Hämtade filer.",
    );
  }
  return (
    <section
      className="backup-panel"
      aria-label="Säkerhetskopiera hela verkstaden"
    >
      <h2>Hela verkstaden i en säkerhetskopia</h2>
      <p>
        Innehåller verktygsregister med maskinuppgifter och utlåning,
        platsbilder samt projekt med bilagor, checklistor och materiallistor.
        Inloggningsuppgifter ingår inte.
      </p>
      <p>
        {last
          ? "Senaste startade export: " + new Date(last).toLocaleString("sv-SE")
          : "Ingen gemensam export har gjorts på den här enheten ännu."}
      </p>
      <div className="backup-actions">
        <button className="primary" disabled={busy} onClick={() => run(backup)}>
          Säkerhetskopiera hela verkstaden
        </button>
        <label className="secondary restore-label">
          Öppna säkerhetskopia
          <input
            type="file"
            disabled={busy}
            accept=".zip,application/zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f)
                run(async () => {
                  setIncoming(null);
                  setRecovery(null);
                  setMessage("Kontrollerar säkerhetskopian och alla bilagor …");
                  setIncoming(await importWorkshop(f));
                  setMessage(
                    "Säkerhetskopian är kontrollerad. Inga uppgifter har ändrats.",
                  );
                });
            }}
          />
        </label>
      </div>
      {incoming && (
        <div className="restore-preview">
          <h3>Förhandsgranska återställning</h3>
          <p>
            {incoming.register.items.length} föremål ·{" "}
            {incoming.register.places.length} platser · {incoming.photos.length}{" "}
            platsbilder · {incoming.projects.projects.length} projekt ·{" "}
            {incoming.projects.files.length} bilagor
          </p>
          <p>
            Återställningen ersätter dessa tre lokala register. Stäng andra
            flikar med verkstaden. Spara först en återställningskopia av det som
            finns här nu.
          </p>
          <div className="backup-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const before = await snapshotWorkshop();
                  download(
                    await exportWorkshop(before),
                    "jans-fore-aterstallning-" + Date.now() + ".zip",
                  );
                  setRecovery(before);
                  setMessage("Spara återställningskopian innan du fortsätter.");
                })
              }
            >
              1. Spara nuvarande uppgifter
            </button>
            <button
              className="danger"
              disabled={busy || !recovery}
              onClick={() =>
                run(async () => {
                  if (
                    !confirm(
                      "Har du sparat återställningskopian? Ersätta verkstaden på den här enheten med den valda säkerhetskopian?",
                    )
                  )
                    return;
                  const current = await snapshotWorkshop();
                  const comparable = (s: Snapshot) =>
                    JSON.stringify({
                      items: s.register.items,
                      places: s.register.places,
                      projects: s.projects,
                      photos: s.photos,
                    });
                  if (comparable(current) !== comparable(recovery!)) {
                    setRecovery(null);
                    throw Error(
                      "Verkstaden har ändrats sedan återställningskopian sparades. Spara en ny kopia i steg 1.",
                    );
                  }
                  await restoreWorkshop(incoming, current);
                  setIncoming(null);
                  setRecovery(null);
                  await onRestored();
                  setMessage(
                    "Hela verkstaden är återställd på den här enheten.",
                  );
                })
              }
            >
              2. Återställ hela verkstaden
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setIncoming(null);
                setRecovery(null);
                setMessage("Återställningen avbröts.");
              }}
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
