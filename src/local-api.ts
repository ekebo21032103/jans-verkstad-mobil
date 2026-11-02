// Originalets registerformat behalls. Version 2 lagger till en separat synkkö.
export type Loan = { borrower: string; lentOn: string; dueOn: string };
export type Item = {
  [key: string]: any;
  loan?: Loan | null;
  loanHistory?: Loan[];
  id: string;
  name: string;
  location: string;
  category: string;
  quantity: number;
  keywords: string;
  notes: string;
  photo: string | null;
  updated: string;
};
export type Place = { id: string; name: string };
export type RecordData = { items: Item[]; places: Place[] };
export type Pending = {
  key: string;
  kind: "item" | "location";
  id: string;
  deleted: boolean;
  changedAt: string;
  version: string;
};
export type RemoteRow = {
  kind: "item" | "location";
  record_id: string;
  content: any;
  changed_at: string;
};
const blank = (): RecordData => ({ items: [], places: [] });
const makeKey = (kind: string, id: string) => kind + ":" + id;
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open("jans-verkstad-mobil", 2);
  r.onupgradeneeded = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains("register"))
      db.createObjectStore("register");
    if (!db.objectStoreNames.contains("pending"))
      db.createObjectStore("pending", { keyPath: "key" });
    if (!db.objectStoreNames.contains("seen")) db.createObjectStore("seen");
    if (!db.objectStoreNames.contains("syncmeta"))
      db.createObjectStore("syncmeta");
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () =>
    reject(
      new Error(
        "Lagringen kunde inte öppnas. Använd vanlig webbläsning, inte privat läge.",
      ),
    );
});
const reqValue = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error || new Error("Lagringen kunde inte uppdateras."));
  });
const changed = (
  before: any[],
  after: any[],
  kind: Pending["kind"],
): Pending[] => {
  const old = new Map(before.map((x) => [x.id, x]));
  const now = new Map(after.map((x) => [x.id, x]));
  const out: Pending[] = [];
  for (const [id, value] of now) {
    if (JSON.stringify(value) !== JSON.stringify(old.get(id))) {
      out.push({
        key: makeKey(kind, id),
        kind,
        id,
        deleted: false,
        changedAt: new Date().toISOString(),
        version: crypto.randomUUID(),
      });
    }
  }
  for (const id of old.keys()) {
    if (!now.has(id))
      out.push({
        key: makeKey(kind, id),
        kind,
        id,
        deleted: true,
        changedAt: new Date().toISOString(),
        version: crypto.randomUUID(),
      });
  }
  return out;
};
async function transaction<T>(
  write: boolean,
  fn: (data: RecordData) => T,
): Promise<T> {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      write ? ["register", "pending"] : ["register"],
      write ? "readwrite" : "readonly",
    );
    const store = tx.objectStore("register"),
      pending = write ? tx.objectStore("pending") : null;
    const req = store.get("data");
    let result: T;
    let failure: unknown;
    req.onsuccess = () => {
      try {
        const data: RecordData = req.result || blank();
        const before = write ? structuredClone(data) : null;
        result = fn(data);
        if (write && before) {
          store.put(data, "data");
          for (const q of [
            ...changed(before.items, data.items, "item"),
            ...changed(before.places, data.places, "location"),
          ])
            pending!.put(q);
        }
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      if (write) window.dispatchEvent(new Event("jans-local-changed"));
      resolve(result);
    };
    tx.onabort = tx.onerror = () =>
      reject(
        failure ||
          new Error(
            "Det gick inte att spara. Lagringsutrymmet kan vara fullt. Exportera en säkerhetskopia.",
          ),
      );
  });
}
export async function api(
  url: string,
  options: RequestInit = {},
): Promise<any> {
  const route = new URL(url, "https://local.invalid");
  const method = options.method || "GET";
  const input = options.body ? JSON.parse(String(options.body)) : {};
  return transaction(method !== "GET", (data) => {
    const list: any[] =
      route.pathname === "/api/items" ? data.items : data.places;
    const id = route.searchParams.get("id");
    if (method === "GET")
      return [...list].sort((a, b) =>
        route.pathname === "/api/items"
          ? b.updated.localeCompare(a.updated)
          : a.name.localeCompare(b.name, "sv", { numeric: true }),
      );
    if (method === "DELETE") {
      const found = list.find((x) => x.id === id);
      if (
        route.pathname === "/api/places" &&
        found &&
        data.items.some((x) => x.location === found.name)
      )
        throw new Error("Flytta föremålen innan du tar bort platsen.");
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) list.splice(i, 1);
      return { ok: true };
    }
    const name = String(input.name || "").trim();
    if (!name || name.length > 200)
      throw new Error("Ange ett namn, högst 200 tecken.");
    const index = input.id ? list.findIndex((x) => x.id === input.id) : -1;
    if (input.id && index < 0) throw new Error("Posten finns inte kvar.");
    if (route.pathname === "/api/places") {
      if (
        data.places.some(
          (x) =>
            x.name.toLocaleLowerCase("sv") === name.toLocaleLowerCase("sv") &&
            x.id !== input.id,
        )
      )
        throw new Error("Den platsen finns redan.");
      if (index >= 0) {
        const old = list[index].name;
        data.items.forEach((x) => {
          if (x.location === old) {
            x.location = name;
            x.updated = new Date().toISOString();
          }
        });
        list[index].name = name;
      } else list.push({ id: crypto.randomUUID(), name });
      return { ok: true };
    }
    let location = String(input.location || "").trim();
    if (
      !location ||
      location.length > 200 ||
      !Number.isInteger(input.quantity) ||
      input.quantity < 1 ||
      input.quantity > 1000000
    )
      throw new Error("Ange förvaringsplats och ett helt antal, minst 1.");
    const place = data.places.find(
      (x) =>
        x.name.toLocaleLowerCase("sv") === location.toLocaleLowerCase("sv"),
    );
    if (place) location = place.name;
    else data.places.push({ id: crypto.randomUUID(), name: location });
    validateMachineFields(input);
    validateLoan(input.loan);
    validateHistory(input.loanHistory);
    const old = index >= 0 ? list[index] : null;
    const item: Item = {
      ...(old || {}),
      ...Object.fromEntries(
        [
          "brand",
          "fitsTo",
          "itemType",
          "manualUrl",
          "model",
          "serial",
          "service",
          "systainer",
          "year",
          "loan",
          "loanHistory",
        ]
          .filter((k) => Object.prototype.hasOwnProperty.call(input, k))
          .map((k) => [k, input[k]]),
      ),
      id: old?.id || crypto.randomUUID(),
      name,
      location,
      quantity: input.quantity,
      category: String(input.category || "Övrigt"),
      keywords: String(input.keywords || ""),
      notes: String(input.notes || ""),
      photo:
        input.photoData === undefined ? old?.photo || null : input.photoData,
      updated: new Date().toISOString(),
    };
    if (index >= 0) list[index] = item;
    else list.push(item);
    return { id: item.id };
  });
}
const machineLimits: Record<string, number> = {
  brand: 250,
  fitsTo: 250,
  itemType: 250,
  manualUrl: 2000,
  model: 250,
  serial: 250,
  service: 2000,
  systainer: 250,
  year: 250,
};
function validateMachineFields(item: any) {
  for (const [key, max] of Object.entries(machineLimits)) {
    if (
      key === "year" &&
      typeof item[key] === "number" &&
      Number.isFinite(item[key])
    )
      item[key] = String(item[key]);
    if (
      item[key] != null &&
      (typeof item[key] !== "string" || item[key].length > max)
    )
      throw Error("Ogiltig maskinuppgift: " + key);
  }
}
function validateHistory(history: any) {
  if (history === undefined) return;
  if (!Array.isArray(history) || history.length > 1000)
    throw Error("Utlåningshistoriken får ha högst 1000 poster.");
  history.forEach(validateLoan);
}
function validateLoan(loan: unknown) {
  if (loan == null) return;
  const l = loan as Loan;
  if (
    typeof l.borrower !== "string" ||
    !l.borrower.trim() ||
    l.borrower.length > 200 ||
    typeof l.lentOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(l.lentOn) ||
    !Number.isFinite(Date.parse(l.lentOn)) ||
    typeof l.dueOn !== "string" ||
    (l.dueOn &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(l.dueOn) ||
        !Number.isFinite(Date.parse(l.dueOn)) ||
        l.dueOn < l.lentOn))
  )
    throw Error(
      "Ange låntagare och giltiga datum. Återlämning får inte vara före utlåning.",
    );
}
export async function moveItems(ids: string[], location: string) {
  const name = location.trim();
  if (!name || name.length > 200) throw Error("Välj en förvaringsplats.");
  return transaction(true, (data) => {
    const chosen = new Set(ids);
    if (!chosen.size) throw Error("Markera minst ett föremål.");
    if ([...chosen].some((id) => !data.items.some((i) => i.id === id)))
      throw Error("Ett markerat föremål finns inte längre. Läs om registret.");
    const place = data.places.find(
      (p) => p.name.toLocaleLowerCase("sv") === name.toLocaleLowerCase("sv"),
    );
    const destination = place?.name || name;
    if (!place) data.places.push({ id: crypto.randomUUID(), name });
    for (const item of data.items)
      if (chosen.has(item.id)) {
        item.location = destination;
        item.updated = new Date().toISOString();
      }
    return chosen.size;
  });
}
export async function exportBackup() {
  return transaction(false, (data) =>
    JSON.stringify(
      {
        format: "jans-verkstad",
        version: 1,
        exported: new Date().toISOString(),
        ...data,
      },
      null,
      2,
    ),
  );
}
export function validateBackup(text: string) {
  const raw = JSON.parse(text);
  if (
    raw.format !== "jans-verkstad" ||
    raw.version !== 1 ||
    !Array.isArray(raw.items) ||
    !Array.isArray(raw.places)
  )
    throw new Error("Det här är inte en säkerhetskopia från Jans verkstad.");
  const ids = new Set();
  const places: Place[] = raw.places.map((p: any) => {
    if (
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 200 ||
      ids.has(p.id)
    )
      throw new Error("Ogiltiga platser i filen.");
    ids.add(p.id);
    return { id: p.id, name: p.name };
  });
  ids.clear();
  const items: Item[] = raw.items.map((i: any) => {
    if (
      typeof i.id !== "string" ||
      ids.has(i.id) ||
      typeof i.name !== "string" ||
      !i.name.trim() ||
      i.name.length > 200 ||
      typeof i.location !== "string" ||
      !i.location.trim() ||
      i.location.length > 200 ||
      !Number.isInteger(i.quantity) ||
      i.quantity < 1 ||
      i.quantity > 1000000 ||
      typeof i.updated !== "string" ||
      !Number.isFinite(Date.parse(i.updated)) ||
      !["category", "keywords", "notes"].every(
        (k) => typeof i[k] === "string",
      ) ||
      (i.photo !== null &&
        (typeof i.photo !== "string" ||
          !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
            i.photo,
          ) ||
          i.photo.length > 4000000))
    )
      throw new Error(
        "Ogiltigt föremål i säkerhetskopian. Ingen data har ändrats.",
      );
    ids.add(i.id);
    validateMachineFields(i);
    validateLoan(i.loan);
    validateHistory(i.loanHistory);
    return {
      ...i,
      id: i.id,
      name: i.name,
      location: i.location,
      quantity: i.quantity,
      category: i.category,
      keywords: i.keywords,
      notes: i.notes,
      photo: i.photo,
      updated: i.updated,
    };
  });
  for (const i of items)
    if (!places.some((p) => p.name === i.location))
      places.push({ id: crypto.randomUUID(), name: i.location });
  return { items, places };
}
export async function restoreBackup(data: RecordData) {
  await transaction(true, (current) => {
    current.items = data.items;
    current.places = data.places;
  });
}

// Lagren som anvands enbart av synkmodulen. Anropa inte api() for att skriva tillbaka molndata.
export async function getSyncSnapshot() {
  const db = await dbPromise,
    tx = db.transaction(
      ["register", "pending", "seen", "syncmeta"],
      "readonly",
    );
  const done = txDone(tx);
  const a = reqValue<RecordData | undefined>(
    tx.objectStore("register").get("data"),
  );
  const b = reqValue<Pending[]>(tx.objectStore("pending").getAll());
  const c = reqValue<string | undefined>(
    tx.objectStore("syncmeta").get("owner"),
  );
  const d = reqValue<boolean | undefined>(
    tx.objectStore("syncmeta").get("active"),
  );
  const [data, pending, owner, active] = await Promise.all([a, b, c, d]);
  await done;
  return {
    data: data || blank(),
    pending,
    owner: owner || null,
    active: !!active,
  };
}
export async function getSeen(key: string) {
  const db = await dbPromise,
    tx = db.transaction("seen", "readonly");
  const done = txDone(tx);
  const value = await reqValue<string | undefined>(
    tx.objectStore("seen").get(key),
  );
  await done;
  return value || null;
}
export async function bindSyncOwner(owner: string) {
  const db = await dbPromise,
    tx = db.transaction("syncmeta", "readwrite");
  tx.objectStore("syncmeta").put(owner, "owner");
  tx.objectStore("syncmeta").put(true, "active");
  await txDone(tx);
}
export async function seedPending() {
  const db = await dbPromise,
    tx = db.transaction(["register", "pending"], "readwrite");
  const done = txDone(tx);
  const data =
    (await reqValue<RecordData>(tx.objectStore("register").get("data"))) ||
    blank();
  const p = tx.objectStore("pending");
  for (const item of data.items)
    p.put({
      key: makeKey("item", item.id),
      kind: "item",
      id: item.id,
      deleted: false,
      changedAt: new Date().toISOString(),
      version: crypto.randomUUID(),
    } as Pending);
  for (const place of data.places)
    p.put({
      key: makeKey("location", place.id),
      kind: "location",
      id: place.id,
      deleted: false,
      changedAt: new Date().toISOString(),
      version: crypto.randomUUID(),
    } as Pending);
  await done;
}
export async function uploadedPending(entry: Pending, serverVersion: string) {
  const db = await dbPromise,
    tx = db.transaction(["pending", "seen"], "readwrite");
  const done = txDone(tx);
  const current = await reqValue<Pending | undefined>(
    tx.objectStore("pending").get(entry.key),
  );
  if (current?.version === entry.version)
    tx.objectStore("pending").delete(entry.key);
  tx.objectStore("seen").put(serverVersion, entry.key);
  await done;
}
export async function receiveRemote(row: RemoteRow, photo: string | null) {
  const key = makeKey(row.kind, row.record_id);
  const db = await dbPromise;
  const tx = db.transaction(["register", "pending", "seen"], "readwrite");
  const done = txDone(tx);
  const q = await reqValue<Pending | undefined>(
    tx.objectStore("pending").get(key),
  );
  if (!q) {
    const s = tx.objectStore("register");
    const data = (await reqValue<RecordData>(s.get("data"))) || blank();
    const list: any[] = row.kind === "item" ? data.items : data.places;
    const ix = list.findIndex((x) => x.id === row.record_id);
    if (row.content._deleted) {
      if (ix >= 0) list.splice(ix, 1);
    } else {
      const value =
        row.kind === "item"
          ? { ...row.content, id: row.record_id, photo }
          : { ...row.content, id: row.record_id };
      if (ix >= 0) list[ix] = value;
      else list.push(value);
    }
    s.put(data, "data");
    tx.objectStore("seen").put(row.changed_at, key);
  }
  await done;
}
