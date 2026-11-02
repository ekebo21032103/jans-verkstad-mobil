import {
  api,
  exportBackup,
  validateBackup,
  restoreBackup,
  moveItems,
  type Item,
} from "./local-api";
import CloudPanel from "./CloudPanel";
import LocationPicker from "./LocationPicker";
import BackupPanel from "./BackupPanel";
import LoanPanel, { overdue } from "./LoanPanel";
("use client");
import { useEffect, useRef, useState } from "react";
import {
  Wrench,
  Package,
  MapPin,
  Camera,
  Plus,
  Search,
  X,
  Check,
  ArrowRight,
  Pencil,
  Trash2,
  LoaderCircle,
  ImagePlus,
  ShieldCheck,
} from "lucide-react";
type Place = { id: string; name: string };
const categories = [
  "Handverktyg",
  "Elverktyg",
  "Tillbehör",
  "Material",
  "Förbrukning",
  "Övrigt",
];
const empty = {
  name: "",
  location: "",
  category: "Handverktyg",
  quantity: 1,
  keywords: "",
  notes: "",
};
export default function Workshop() {
  const [items, setItems] = useState<Item[]>([]),
    [places, setPlaces] = useState<Place[]>([]),
    [tab, setTab] = useState("items"),
    [query, setQuery] = useState(""),
    [location, setLocation] = useState(""),
    [category, setCategory] = useState("Alla");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [auth, setAuth] = useState(false),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Partial<Item> | null>(null),
    [form, setForm] = useState<Partial<Item>>(empty),
    [photoData, setPhotoData] = useState<string | null | undefined>(),
    [photoBusy, setPhotoBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  const [detail, setDetail] = useState<Item | null>(null),
    [placeEdit, setPlaceEdit] = useState<Partial<Place> | null>(null),
    [placeName, setPlaceName] = useState("");
  const [sort, setSort] = useState("recent"),
    [loanFilter, setLoanFilter] = useState("all"),
    [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [destination, setDestination] = useState("");
  const editor = useRef<HTMLDialogElement>(null),
    viewer = useRef<HTMLDialogElement>(null),
    placeDialog = useRef<HTMLDialogElement>(null);
  async function refresh() {
    try {
      const [data, p] = await Promise.all([
        api("/api/items"),
        api("/api/places"),
      ]);
      setItems(data as Item[]);
      setDetail((current) =>
        current ? data.find((i: Item) => i.id === current.id) || null : null,
      );
      setPlaces(p as Place[]);
      setError("");
      setAuth(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const updated = () => {
      refresh();
    };
    window.addEventListener("jans-cloud-refreshed", updated);
    return () => window.removeEventListener("jans-cloud-refreshed", updated);
  }, []);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("nyplats") === "1") {
        setTab("places");
        openPlace();
        url.searchParams.delete("nyplats");
        history.replaceState(
          history.state,
          "",
          url.pathname + url.search + url.hash,
        );
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (editing) editor.current?.showModal();
    else editor.current?.close();
  }, [editing]);
  useEffect(() => {
    if (detail) viewer.current?.showModal();
    else viewer.current?.close();
  }, [detail]);
  useEffect(() => {
    if (placeEdit) placeDialog.current?.showModal();
    else placeDialog.current?.close();
  }, [placeEdit]);
  function edit(item?: Item) {
    setDetail(null);
    setForm(item ? { ...item } : { ...empty, location });
    setPhotoData(undefined);
    setFormError("");
    setEditing(item || {});
  }
  const photo =
    photoData === undefined ? (form.photo ? form.photo : null) : photoData;
  async function choosePhoto(file?: File) {
    if (!file) return;
    setPhotoBusy(true);
    setFormError("");
    try {
      if (file.size > 30 * 1024 * 1024)
        throw new Error("Välj en bild som är mindre än 30 MB.");
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () =>
            reject(
              new Error("Bilden kunde inte öppnas. Välj JPG, PNG eller WebP."),
            );
          img.src = url;
        });
        const ratio = Math.min(1, 1400 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas
          .getContext("2d")!
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhotoData(canvas.toDataURL("image/jpeg", 0.82));
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await api("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, photoData }),
      });
      setEditing(null);
      setNotice("Föremålet är sparat");
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(item: Item) {
    if (!confirm("Ta bort ”" + item.name + "” från registret?")) return;
    setSaving(true);
    try {
      await api("/api/items?id=" + encodeURIComponent(item.id), {
        method: "DELETE",
      });
      setDetail(null);
      setNotice("Föremålet är borttaget");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function openPlace(p?: Place) {
    setPlaceEdit(p || {});
    setPlaceName(p?.name || "");
    setFormError("");
  }
  async function savePlace(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: placeEdit?.id, name: placeName }),
      });
      if (location === placeEdit?.name) setLocation(placeName.trim());
      setPlaceEdit(null);
      setNotice("Förvaringsplatsen är sparad");
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function removePlace() {
    if (!confirm("Ta bort förvaringsplatsen ”" + placeEdit?.name + "”?"))
      return;
    setSaving(true);
    try {
      await api("/api/places?id=" + encodeURIComponent(placeEdit!.id!), {
        method: "DELETE",
      });
      setPlaceEdit(null);
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function backup() {
    try {
      const json = await exportBackup();
      if (new Blob([json]).size > 150 * 1024 * 1024)
        throw Error(
          "Registret är för stort för äldre JSON-format. Använd Säkerhetskopiera hela verkstaden.",
        );
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        "jans-verkstad-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice("Säkerhetskopian är klar att spara");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restore(file?: File) {
    if (!file) return;
    try {
      if (file.size > 150 * 1024 * 1024)
        throw new Error("Säkerhetskopian är för stor (högst 150 MB).");
      const data = validateBackup(await file.text());
      if (
        !confirm(
          "Återställ " +
            data.items.length +
            " föremål från filen? Det ersätter registret på denna enhet. Exportera först om du vill behålla det nuvarande registret.",
        )
      )
        return;
      await restoreBackup(data);
      setLocation("");
      setQuery("");
      setCategory("Alla");
      await refresh();
      setNotice("Säkerhetskopian är återställd");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const norm = (s: string) =>
    s
      .toLocaleLowerCase("sv")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const matches = (s: string) =>
    norm(query)
      .split(/\s+/)
      .every((q) => norm(s).includes(q));
  const filtered = items
    .filter(
      (i) =>
        (loanFilter === "all" ||
          (loanFilter === "borrowed" ? !!i.loan : overdue(i))) &&
        (!location || i.location === location) &&
        (category === "Alla" || i.category === category) &&
        matches(
          [
            i.name,
            i.location,
            i.keywords,
            i.notes,
            i.category,
            i.brand,
            i.model,
            i.serial,
            i.itemType,
            i.fitsTo,
            i.systainer,
            i.service,
            i.year,
            i.loan?.borrower,
          ].join(" "),
        ),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "sv", { numeric: true })
        : sort === "place"
          ? a.location.localeCompare(b.location, "sv", { numeric: true }) ||
            a.name.localeCompare(b.name, "sv", { numeric: true })
          : 0,
    );
  async function moveSelected(e: React.FormEvent) {
    e.preventDefault();
    if (
      !confirm(
        "Flytta " +
          selected.size +
          " markerade föremål till ”" +
          destination +
          "”? Även markerade föremål som döljs av filter ingår.",
      )
    )
      return;
    setSaving(true);
    try {
      const count = await moveItems([...selected], destination);
      setSelected(new Set());
      setSelecting(false);
      setDestination("");
      await refresh();
      setNotice(count + " föremål har flyttats");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function showPlace(name: string) {
    setLocation(name);
    setQuery("");
    setCategory("Alla");
    setTab("items");
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="./">
          <span className="brand-icon">
            <Wrench size={29} />
          </span>
          <span>
            <strong>Jans verkstad</strong>
            <small>EN PLATS FÖR ALLT</small>
          </span>
        </a>
        <nav aria-label="Huvudmeny">
          <button
            className={tab === "items" ? "active" : ""}
            onClick={() => {
              setTab("items");
              setQuery("");
            }}
          >
            <Package />
            <span>Verktygsregistret</span>
            <b>{items.length}</b>
          </button>
          <button
            className={tab === "places" ? "active" : ""}
            onClick={() => {
              setTab("places");
              setQuery("");
            }}
          >
            <MapPin />
            <span>Förvaringsplatser</span>
            <b>{places.length}</b>
          </button>
          <a className="jans-project-link" href="./projekt-ritningar.html">
            Projekt &amp; ritningar
          </a>
          <a
            className="jans-project-link"
            href="./verkstadsoversikt.html?vy=register"
          >
            Registerlista &amp; PDF
          </a>
          <a
            className="jans-project-link"
            href="./verkstadsoversikt.html?vy=festool"
          >
            Min Festool-samling
          </a>
          <a
            className="jans-project-link"
            href="./forvaringsplatser-bilder.html"
          >
            Platser i bilder
          </a>
          <a className="jans-project-link" href="./synk-anslut.html">
            Anslut molnet säkert
          </a>
        </nav>
        <div className="sidebar-foot">
          <ShieldCheck size={17} />
          <span>Lokal lagring med valfri molnsynk</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            MIN VERKSTAD <i>/</i> {tab === "items" ? "ÖVERSIKT" : "FÖRVARING"}
          </span>
          <span className="avatar" aria-label="Jans verkstad">
            JJ
          </span>
        </header>
        <section className="intro">
          <p className="eyebrow">ORDNING SOM HÅLLER</p>
          <h1>
            {tab === "items"
              ? "Mindre letande. Mer snickeri."
              : "En plats för varje sak."}
          </h1>
          <p className="subtitle">
            {tab === "items"
              ? "Dina verktyg, material och småsaker — samlade på ett ställe."
              : "Märk upp skåp, hyllor och lådor. Här hittar du vad som finns i dem."}
          </p>
          <button
            className="primary add"
            disabled={auth || loading}
            onClick={() => (tab === "items" ? edit() : openPlace())}
          >
            <Plus />
            {tab === "items"
              ? "Lägg till föremål"
              : "Lägg till förvaringsplats"}
          </button>
        </section>
        <section className="stats" aria-label="Översikt">
          <div>
            <Package />
            <strong>{items.length}</strong>
            <span>Registrerade föremål</span>
          </div>
          <div>
            <MapPin />
            <strong>{places.length}</strong>
            <span>Förvaringsplatser</span>
          </div>
          <div>
            <Camera />
            <strong>{items.filter((i) => i.photo).length}</strong>
            <span>Föremål med foto</span>
          </div>
        </section>
        {auth ? (
          <div className="empty">
            <ShieldCheck />
            <h2>Ditt register, nära till hands.</h2>
            <p>
              Logga in med ChatGPT för att spara verktyg och foton och hitta dem
              på dina enheter.
            </p>
            <a
              className="primary"
              href="/signin-with-chatgpt?return_to=/"
              target="_top"
            >
              Logga in med ChatGPT <ArrowRight size={18} />
            </a>
          </div>
        ) : (
          <>
            {error && (
              <div className="error" role="alert">
                {error} <button onClick={refresh}>Försök igen</button>
              </div>
            )}
            <div className="filters">
              <div className="search">
                <Search />
                <input
                  aria-label="Sök i registret"
                  placeholder={
                    tab === "items"
                      ? "Vad letar du efter? Sök namn, sökord eller plats…"
                      : "Sök förvaringsplats…"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    className="icon"
                    aria-label="Rensa sökning"
                    onClick={() => setQuery("")}
                  >
                    <X size={19} />
                  </button>
                )}
              </div>
              {tab === "items" && (
                <select
                  aria-label="Filtrera på plats"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="">Alla platser</option>
                  {places.map((p) => (
                    <option key={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
            {tab === "items" && (
              <div className="chips" aria-label="Kategorier">
                {["Alla", ...categories].map((c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    className={category === c ? "selected" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            {tab === "items" && (
              <div className="list-tools">
                <label>
                  Sortera{" "}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="recent">Senast uppdaterade</option>
                    <option value="name">Namn A–Ö</option>
                    <option value="place">Förvaringsplats</option>
                  </select>
                </label>
                <label>
                  Utlåning{" "}
                  <select
                    value={loanFilter}
                    onChange={(e) => setLoanFilter(e.target.value)}
                  >
                    <option value="all">Alla föremål</option>
                    <option value="borrowed">Utlånade</option>
                    <option value="overdue">Försenade</option>
                  </select>
                </label>
                <button
                  className="secondary"
                  disabled={saving}
                  onClick={() => {
                    setSelecting(!selecting);
                    setSelected(new Set());
                    setDestination("");
                  }}
                >
                  {selecting ? "Avsluta markering" : "Flytta flera föremål"}
                </button>
              </div>
            )}
            {tab === "items" && selecting && (
              <form className="bulk-panel" onSubmit={moveSelected}>
                <h2>Flytta markerade föremål</h2>
                <p role="status">
                  {selected.size} markerade. Markeringar behålls när du
                  filtrerar.
                </p>
                <div className="backup-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setSelected(
                        new Set([...selected, ...filtered.map((i) => i.id)]),
                      )
                    }
                  >
                    Markera alla som visas ({filtered.length})
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSelected(new Set())}
                  >
                    Rensa markering
                  </button>
                </div>
                <LocationPicker
                  places={places}
                  value={destination}
                  onChange={setDestination}
                  disabled={saving}
                />
                <button
                  className="primary"
                  disabled={saving || !selected.size || !destination.trim()}
                >
                  {saving ? "Flyttar…" : "Flytta " + selected.size + " föremål"}
                </button>
              </form>
            )}
            <div className="section-heading">
              <h2>
                {tab === "items"
                  ? location || "Ditt register"
                  : "Dina förvaringsplatser"}{" "}
                <b>
                  {tab === "items"
                    ? filtered.length
                    : places.filter((p) => matches(p.name)).length}
                </b>
              </h2>
              <span>
                {tab === "items"
                  ? sort === "recent"
                    ? "Senast uppdaterade först"
                    : sort === "name"
                      ? "Sorterade på namn"
                      : "Sorterade på plats"
                  : "Ordning från skåp till låda"}
              </span>
            </div>
            {loading ? (
              <div className="empty">
                <LoaderCircle className="spin" />
                <p>Hämtar ditt register…</p>
              </div>
            ) : tab === "items" ? (
              filtered.length ? (
                <div className="grid">
                  {filtered.map((item) => (
                    <div className="selectable-item" key={item.id}>
                      {selecting && (
                        <label className="selection-label">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            aria-label={"Markera " + item.name}
                            onChange={(e) => {
                              const next = new Set(selected);
                              e.target.checked
                                ? next.add(item.id)
                                : next.delete(item.id);
                              setSelected(next);
                            }}
                          />{" "}
                          Markera {item.name}
                        </label>
                      )}
                      <button
                        className="item-card"
                        onClick={() => setDetail(item)}
                      >
                        <div
                          className={
                            "item-photo " + (!item.photo ? "no-photo" : "")
                          }
                        >
                          {item.photo ? (
                            <img
                              src={item.photo}
                              alt={item.name}
                              loading="lazy"
                            />
                          ) : (
                            <Wrench size={44} />
                          )}
                          <span className="quantity">{item.quantity} st</span>
                        </div>
                        <div className="card-body">
                          <small>{item.category}</small>
                          <h3>{item.name}</h3>
                          <div className="location">
                            <MapPin size={18} />
                            <span>{item.location}</span>
                            <ArrowRight size={16} />
                          </div>
                          {item.loan && (
                            <p
                              className={
                                overdue(item)
                                  ? "loan-badge overdue"
                                  : "loan-badge"
                              }
                            >
                              Utlånat: {item.loan.borrower}
                              {overdue(item) ? " · Försenat" : ""}
                            </p>
                          )}
                          {item.keywords && (
                            <p className="keywords">{item.keywords}</p>
                          )}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <span className="empty-icon">
                    <Wrench size={42} />
                  </span>
                  <h2>
                    {items.length
                      ? "Inga föremål hittades"
                      : "Här börjar ordningen."}
                  </h2>
                  <p>
                    {items.length
                      ? "Prova ett annat sökord, en annan plats eller kategori."
                      : "Lägg in ditt första verktyg, ta ett foto och ange var det ligger."}
                  </p>
                  {items.length ? (
                    <button
                      className="secondary"
                      onClick={() => {
                        setQuery("");
                        setLocation("");
                        setCategory("Alla");
                      }}
                    >
                      Rensa filter
                    </button>
                  ) : (
                    <button className="primary" onClick={() => edit()}>
                      <Plus size={19} />
                      Lägg till ditt första föremål
                    </button>
                  )}
                </div>
              )
            ) : (
              <>
                {places.filter((p) => matches(p.name)).length ? (
                  <div className="places-grid">
                    {places
                      .filter((p) => matches(p.name))
                      .map((p) => (
                        <article className="place-card" key={p.id}>
                          <div className="place-top">
                            <span className="place-icon">
                              <MapPin />
                            </span>
                            <button
                              className="icon"
                              aria-label={"Redigera " + p.name}
                              onClick={() => openPlace(p)}
                            >
                              <Pencil size={18} />
                            </button>
                          </div>
                          <h3>{p.name}</h3>
                          <p>
                            {items.filter((i) => i.location === p.name).length}{" "}
                            föremål
                          </p>
                          <button
                            className="text-button"
                            onClick={() => showPlace(p.name)}
                          >
                            Visa innehåll <ArrowRight size={18} />
                          </button>
                        </article>
                      ))}
                  </div>
                ) : (
                  <div className="empty">
                    <span className="empty-icon">
                      <MapPin size={42} />
                    </span>
                    <h2>
                      {query
                        ? "Ingen plats hittades"
                        : "Ge dina saker en hemvist."}
                    </h2>
                    <p>
                      Exempel: Skåp A · Låda 1. Använd samma namn på etiketten
                      och i registret.
                    </p>
                    <button className="primary" onClick={() => openPlace()}>
                      <Plus size={19} />
                      Lägg till förvaringsplats
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        <CloudPanel />
        <BackupPanel
          onRestored={async () => {
            setLocation("");
            setQuery("");
            setSelected(new Set());
            setDetail(null);
            await refresh();
          }}
        />
        <section className="backup-panel">
          <h2>Separat kopia av verktygsregistret</h2>
          <p>
            Ditt register sparas även lokalt på den här enheten. Exportera
            regelbundet en extra säkerhetskopia till iCloud Drive, även när
            molnsynkronisering används.
          </p>
          <div>
            <button className="secondary" onClick={backup} disabled={loading}>
              Exportera endast verktygsregister
            </button>
            <label className="secondary restore-label">
              Återställ äldre registerkopia
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  restore(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <details>
            <summary>Lägg appen på hemskärmen</summary>
            <p>
              iPhone: öppna länken i Safari, tryck på Dela och välj Lägg till på
              hemskärmen. Android: öppna länken i Chrome och välj Lägg till på
              startskärmen i menyn. Använd samma öppningssätt varje gång. Appen
              kan öppnas utan nät efter att den har laddats och sparats för
              offlinebruk.
            </p>
          </details>
        </section>
        <footer>
          JANS VERKSTAD <span>Lite mer ordning. Lite mer arbetsro.</span>
        </footer>
      </main>
      <dialog
        aria-label="Redigera föremål"
        ref={editor}
        onCancel={(e) => {
          if (saving || photoBusy) e.preventDefault();
          else setEditing(null);
        }}
      >
        <form onSubmit={save}>
          <div className="dialog-heading">
            <div>
              <p className="eyebrow">VERKTYGSREGISTRET</p>
              <h2>{editing?.id ? "Redigera föremål" : "Lägg till föremål"}</h2>
            </div>
            <button
              type="button"
              className="icon"
              disabled={saving || photoBusy}
              onClick={() => setEditing(null)}
              aria-label="Stäng"
            >
              <X />
            </button>
          </div>
          <div className={"upload " + (photo ? "has-photo" : "")}>
            {photo ? (
              <img src={photo} alt="Foto av föremålet" />
            ) : (
              <>
                <Camera size={35} />
                <strong>Ta eller välj ett foto</strong>
                <p>
                  Foto är valfritt. Ett tydligt foto gör det enklare att hitta
                  rätt.
                </p>
              </>
            )}
            <div className="photo-actions">
              <label className="secondary">
                <Camera size={18} />
                Ta foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={saving || photoBusy}
                  onChange={(e) => {
                    choosePhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="secondary">
                <ImagePlus size={18} />
                Välj bild
                <input
                  type="file"
                  accept="image/*"
                  disabled={saving || photoBusy}
                  onChange={(e) => {
                    choosePhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {photo && (
                <button
                  type="button"
                  className="icon"
                  aria-label="Ta bort foto"
                  disabled={saving || photoBusy}
                  onClick={() => setPhotoData(null)}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            {photoBusy && <p role="status">Förbereder bilden…</p>}
          </div>
          <label className="field">
            Namn *
            <input
              required
              autoFocus
              maxLength={200}
              placeholder="Till exempel: Stanley nr 3, putshyvel"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          {editing && (
            <LocationPicker
              places={places}
              value={form.location || ""}
              onChange={(location) => setForm({ ...form, location })}
              disabled={saving || photoBusy}
            />
          )}
          <div className="field-row">
            <label className="field">
              Kategori
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Antal
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                required
                value={form.quantity ?? 1}
                onChange={(e) =>
                  setForm({ ...form, quantity: e.target.valueAsNumber })
                }
              />
            </label>
          </div>
          <label className="field">
            Sökord
            <input
              maxLength={2000}
              placeholder="Exempel: hyvelstål, handhyvel, hyvling"
              value={form.keywords || ""}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            />
          </label>
          <label className="field">
            Anteckningar
            <textarea
              maxLength={10000}
              rows={3}
              placeholder="Mått, modell, tillhörande maskin eller annat att komma ihåg."
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <details className="extra-fields">
            <summary>Maskinuppgifter och bruksanvisning</summary>
            <label className="field">
              Fabrikat
              <input
                maxLength={250}
                placeholder="Festool, Makita, Stanley …"
                value={form.brand || ""}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </label>
            <label className="field">
              Typ av föremål
              <input
                maxLength={250}
                placeholder="Maskin, Tillbehör, Systainer …"
                value={form.itemType || ""}
                onChange={(e) => setForm({ ...form, itemType: e.target.value })}
              />
            </label>
            <label className="field">
              Modell
              <input
                maxLength={250}
                placeholder="TS 55, DF 500 …"
                value={form.model || ""}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </label>
            <label className="field">
              Serienummer
              <input
                maxLength={250}
                placeholder=""
                value={form.serial || ""}
                onChange={(e) => setForm({ ...form, serial: e.target.value })}
              />
            </label>
            <label className="field">
              Tillverkningsår
              <input
                maxLength={250}
                placeholder=""
                value={form.year || ""}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </label>
            <label className="field">
              Systainer / förvaring
              <input
                maxLength={250}
                placeholder=""
                value={form.systainer || ""}
                onChange={(e) =>
                  setForm({ ...form, systainer: e.target.value })
                }
              />
            </label>
            <label className="field">
              Passar till (maskinmodell)
              <input
                maxLength={250}
                placeholder=""
                value={form.fitsTo || ""}
                onChange={(e) => setForm({ ...form, fitsTo: e.target.value })}
              />
            </label>
            <label className="field">
              Service och underhåll
              <input
                maxLength={2000}
                placeholder=""
                value={form.service || ""}
                onChange={(e) => setForm({ ...form, service: e.target.value })}
              />
            </label>
            <label className="field">
              Länk till bruksanvisning (https://…)
              <input
                type="url"
                maxLength={2000}
                placeholder="https://…"
                value={form.manualUrl || ""}
                onChange={(e) =>
                  setForm({ ...form, manualUrl: e.target.value })
                }
              />
            </label>
          </details>
          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <div className="dialog-footer">
            <button
              type="button"
              className="secondary"
              disabled={saving || photoBusy}
              onClick={() => setEditing(null)}
            >
              Avbryt
            </button>
            <button className="primary" disabled={saving || photoBusy}>
              {saving ? "Sparar…" : "Spara föremål"}
              <Check size={20} />
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        aria-label="Föremålsuppgifter"
        ref={viewer}
        onCancel={() => setDetail(null)}
      >
        {detail && (
          <div>
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">{detail.category}</p>
                <h2>{detail.name}</h2>
              </div>
              <button
                className="icon"
                aria-label="Stäng"
                onClick={() => setDetail(null)}
              >
                <X />
              </button>
            </div>
            {detail.photo && (
              <img
                className="detail-photo"
                src={detail.photo}
                alt={detail.name}
              />
            )}
            <div className="detail-location">
              <MapPin size={28} />
              <div>
                <small>HÄR FINNS DEN</small>
                <strong>{detail.location}</strong>
              </div>
            </div>
            <dl>
              <dt>Antal</dt>
              <dd>{detail.quantity} st</dd>
              {detail.keywords && (
                <>
                  <dt>Sökord</dt>
                  <dd>{detail.keywords}</dd>
                </>
              )}
              {detail.notes && (
                <>
                  <dt>Anteckningar</dt>
                  <dd className="prewrap">{detail.notes}</dd>
                </>
              )}
            </dl>
            <dl>
              {detail.brand && (
                <>
                  <dt>Fabrikat</dt>
                  <dd>{detail.brand}</dd>
                </>
              )}
              {detail.itemType && (
                <>
                  <dt>Typ av föremål</dt>
                  <dd>{detail.itemType}</dd>
                </>
              )}
              {detail.model && (
                <>
                  <dt>Modell</dt>
                  <dd>{detail.model}</dd>
                </>
              )}
              {detail.serial && (
                <>
                  <dt>Serienummer</dt>
                  <dd>{detail.serial}</dd>
                </>
              )}
              {detail.year && (
                <>
                  <dt>Tillverkningsår</dt>
                  <dd>{detail.year}</dd>
                </>
              )}
              {detail.systainer && (
                <>
                  <dt>Systainer / förvaring</dt>
                  <dd>{detail.systainer}</dd>
                </>
              )}
              {detail.fitsTo && (
                <>
                  <dt>Passar till (maskinmodell)</dt>
                  <dd>{detail.fitsTo}</dd>
                </>
              )}
              {detail.service && (
                <>
                  <dt>Service och underhåll</dt>
                  <dd>{detail.service}</dd>
                </>
              )}
            </dl>
            {detail.manualUrl && /^https?:\/\//i.test(detail.manualUrl) && (
              <p>
                <a
                  href={detail.manualUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Öppna bruksanvisning
                </a>
              </p>
            )}
            <LoanPanel key={detail.id} item={detail} onSaved={refresh} />
            <div className="dialog-footer">
              <button
                className="danger icon"
                title="Ta bort föremål"
                aria-label="Ta bort föremål"
                disabled={saving}
                onClick={() => remove(detail)}
              >
                <Trash2 size={20} />
              </button>
              <button
                className="secondary"
                onClick={() => {
                  showPlace(detail.location);
                  setDetail(null);
                }}
              >
                Visa plats
              </button>
              <button className="primary" onClick={() => edit(detail)}>
                <Pencil size={18} />
                Redigera
              </button>
            </div>
          </div>
        )}
      </dialog>
      <dialog
        aria-label="Förvaringsplats"
        className="place-dialog"
        ref={placeDialog}
        onCancel={(e) => {
          if (saving) e.preventDefault();
          else setPlaceEdit(null);
        }}
      >
        <form onSubmit={savePlace}>
          <div className="dialog-heading">
            <div>
              <p className="eyebrow">FÖRVARINGSPLATSER</p>
              <h2>{placeEdit?.id ? "Redigera plats" : "Lägg till plats"}</h2>
            </div>
            <button
              type="button"
              className="icon"
              disabled={saving}
              aria-label="Stäng"
              onClick={() => setPlaceEdit(null)}
            >
              <X />
            </button>
          </div>
          <label className="field">
            Platsens namn *
            <input
              required
              autoFocus
              maxLength={200}
              value={placeName}
              placeholder="Skåp A · Låda 1"
              onChange={(e) => setPlaceName(e.target.value)}
            />
            <small>
              {placeEdit?.id
                ? "Föremål på platsen följer med när du byter namn."
                : "Märk lådan eller hyllan med samma namn."}
            </small>
          </label>
          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <div className="dialog-footer">
            {placeEdit?.id && (
              <button
                type="button"
                className="danger icon"
                aria-label="Ta bort plats"
                disabled={saving}
                onClick={removePlace}
              >
                <Trash2 size={20} />
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => setPlaceEdit(null)}
            >
              Avbryt
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Sparar…" : "Spara plats"}
              <Check size={20} />
            </button>
          </div>
        </form>
      </dialog>
      {notice && (
        <div className="toast" role="status">
          <Check size={19} />
          {notice}
        </div>
      )}
    </div>
  );
}
