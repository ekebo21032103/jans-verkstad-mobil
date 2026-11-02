// ZIP without compression: Blob slices keep large PDF/photo backups out of JS strings.
// Only our own stored ZIP format is accepted; no files are extracted to disk.
export const MAX_ARCHIVE = 2 * 1024 ** 3;
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
async function crc(blob) {
  let sum = 0xffffffff;
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const byte of value) sum = table[(sum ^ byte) & 255] ^ (sum >>> 8);
    }
  } finally {
    reader.releaseLock();
  }
  return (sum ^ 0xffffffff) >>> 0;
}
function header(size) {
  const a = new Uint8Array(size);
  return [a, new DataView(a.buffer)];
}
/** @param {{name:string,blob:Blob}[]} entries @param {(done:number,total:number)=>void} progress */
export async function createZip(entries, progress = (_done, _total) => {}) {
  if (entries.length > 65000) throw Error("För många filer i säkerhetskopian.");
  const parts = [],
    directory = [],
    names = new Set();
  let offset = 0,
    centralSize = 0;
  const total = entries.reduce(
    (n, e) => n + e.blob.size + encoder.encode(e.name).length * 2 + 76,
    22,
  );
  if (total > MAX_ARCHIVE)
    throw Error(
      "Säkerhetskopian får vara högst 2 GB. Exportera mindre delar separat.",
    );
  for (let i = 0; i < entries.length; i++) {
    const { name, blob } = entries[i],
      nameBytes = encoder.encode(name);
    if (!name || nameBytes.length > 65535 || names.has(name))
      throw Error("Ogiltigt eller upprepat filnamn.");
    names.add(name);
    const checksum = await crc(blob);
    const [local, v] = header(30);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, checksum, true);
    v.setUint32(18, blob.size, true);
    v.setUint32(22, blob.size, true);
    v.setUint16(26, nameBytes.length, true);
    parts.push(local, nameBytes, blob);
    const [central, c] = header(46);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint32(16, checksum, true);
    c.setUint32(20, blob.size, true);
    c.setUint32(24, blob.size, true);
    c.setUint16(28, nameBytes.length, true);
    c.setUint32(42, offset, true);
    directory.push(central, nameBytes);
    centralSize += 46 + nameBytes.length;
    offset += 30 + nameBytes.length + blob.size;
    progress(i + 1, entries.length);
  }
  const [end, e] = header(22);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: "application/zip" });
}
export async function readZip(file) {
  if (file.size > MAX_ARCHIVE || file.size < 22)
    throw Error("Ogiltig ZIP-fil eller större än 2 GB.");
  const end = new DataView(await file.slice(-22).arrayBuffer());
  if (
    end.getUint32(0, true) !== 0x06054b50 ||
    end.getUint16(20, true) !== 0 ||
    end.getUint32(4, true) !== 0 ||
    end.getUint16(8, true) !== end.getUint16(10, true)
  )
    throw Error("ZIP-formatet stöds inte. Välj en säkerhetskopia från appen.");
  const size = end.getUint32(12, true),
    offset = end.getUint32(16, true),
    count = end.getUint16(10, true);
  if (offset + size !== file.size - 22) throw Error("ZIP-katalogen är skadad.");
  const directory = await file.slice(offset, offset + size).arrayBuffer(),
    v = new DataView(directory),
    files = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > size || v.getUint32(p, true) !== 0x02014b50)
      throw Error("ZIP-katalogen är skadad.");
    const nameLength = v.getUint16(p + 28, true),
      extra = v.getUint16(p + 30, true),
      comment = v.getUint16(p + 32, true),
      length = v.getUint32(p + 24, true),
      local = v.getUint32(p + 42, true),
      checksum = v.getUint32(p + 16, true);
    if (
      p + 46 + nameLength + extra + comment > size ||
      v.getUint16(p + 10, true) !== 0 ||
      (v.getUint16(p + 8, true) & ~0x800) !== 0 ||
      v.getUint32(p + 20, true) !== length ||
      v.getUint16(p + 34, true) !== 0 ||
      local + 30 > offset
    )
      throw Error(
        "ZIP-filen måste vara en okomprimerad säkerhetskopia från appen.",
      );
    const name = decoder.decode(new Uint8Array(directory, p + 46, nameLength));
    if (!name || files.has(name) || name.includes("..") || name.startsWith("/"))
      throw Error("Ogiltigt filnamn i säkerhetskopian.");
    const localBuffer = await file.slice(local, local + 30).arrayBuffer(),
      h = new DataView(localBuffer);
    const start = local + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    if (
      h.getUint32(0, true) !== 0x04034b50 ||
      h.getUint16(8, true) !== 0 ||
      h.getUint32(18, true) !== length ||
      h.getUint32(14, true) !== checksum ||
      start + length > offset
    )
      throw Error("ZIP-filen är skadad.");
    const blob = file.slice(start, start + length);
    if ((await crc(blob)) !== checksum)
      throw Error(
        "En fil i säkerhetskopian är skadad. Ingen återställning gjordes.",
      );
    files.set(name, blob);
    p += 46 + nameLength + extra + comment;
  }
  if (p !== size) throw Error("ZIP-katalogen är skadad.");
  return files;
}
export function jsonBlob(value) {
  return new Blob([JSON.stringify(value)], { type: "application/json" });
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
