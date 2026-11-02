import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const handlers = {},
  stored = new Map(),
  origin = "https://example.test",
  root = origin + "/jans-verkstad-mobil/";
function key(input) {
  return new URL(input.url || input, root).href;
}
const cache = {
  addAll: async (files) => {
    for (const f of files)
      stored.set(key(f), new Response(f === "./index.html" ? "MAIN" : f));
  },
  put: async (k, v) => stored.set(key(k), v),
  match: async (k, options) => {
    let v = key(k);
    if (options?.ignoreSearch) v = v.split("?")[0];
    const result = stored.get(v);
    return result?.clone();
  },
};
const sandbox = {
  URL,
  Response,
  Promise,
  self: {
    location: { origin, href: root + "sw.js" },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    addEventListener: (n, f) => (handlers[n] = f),
  },
  caches: {
    open: async () => cache,
    keys: async () => [],
    match: cache.match,
    delete: async () => true,
  },
  fetch: async () => {
    throw Error("offline");
  },
};
const script = readFileSync("scripts/sw-template.js", "utf8")
  .replace("__CACHE_NAME__", JSON.stringify("jans-verkstad-app-test"))
  .replace(
    "__CACHE_FILES__",
    JSON.stringify(["./index.html", "./projekt-ritningar.html"]),
  );
vm.runInNewContext(script, sandbox);
let pending;
handlers.install({ waitUntil: (p) => (pending = p) });
await pending;
async function navigate(url) {
  let result;
  handlers.fetch({
    request: { url, method: "GET", mode: "navigate" },
    respondWith: (p) => (result = p),
    waitUntil: (p) => p,
  });
  return result;
}
assert.equal(await (await navigate(root)).text(), "MAIN");
assert.equal(await (await navigate(root + "?nyplats=1")).text(), "MAIN");
assert.equal(
  await (await navigate(root + "projekt-ritningar.html")).text(),
  "./projekt-ritningar.html",
);
stored.delete(root);
assert.equal(await (await navigate(root)).text(), "MAIN");
const missing = await navigate(root + "missing.html");
assert.equal(missing.status, 503);
assert(!script.includes("verkstad-v3-2"));
console.log(
  "PASS: first-visit offline root, query parameters, index fallback, correct project page, no fallback to a test database.",
);
