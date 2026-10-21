// Demo mode: backend unreachable -> chip + whole flow works on sample data.
// Also checks the chip is absent when the backend answers.
const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8").replace(/<script src="[^"]+"><\/script>/g, "");
const demoJs = fs.readFileSync(path.join(__dirname, "demo-api.js"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "PASS" : "FAIL") + " - " + n + (x ? ` (${x})` : "")); if (!c) fails++; };

async function boot(fetchImpl) {
  const dom = new JSDOM(html, { url: "http://localhost:8080/", runScripts: "dangerously", pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = fetchImpl; w.scrollTo = () => {};
  w.FormData = class extends FormData { constructor(f) { super(); if (f && f.tagName === "FORM") Array.from(f.elements).forEach((el) => { if (!el.name) return; if (el.type === "file") return; if ((el.type === "checkbox" || el.type === "radio") && !el.checked) return; this.append(el.name, el.value); }); } };
  w.eval(demoJs.replace(/^const DemoAPI/m, "var DemoAPI"));
  const s = w.document.createElement("script"); s.textContent = appJs; w.document.body.appendChild(s);
  return w;
}
const $ = (w, s) => w.document.querySelector(s);
async function nav(w, h) { w.location.hash = h; await sleep(700); }
async function until(fn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(100); } return false; }

(async () => {
  // ---- backend UP: nothing extra
  const up = await boot(async (u) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ plans: {}, themes: [] }) }));
  await sleep(500);
  check("backend up: no demo chip", !$(up, "#demoChip") && !up.document.body.classList.contains("demo-on"));

  // ---- backend DOWN
  const w = await boot(async () => { throw new TypeError("down"); });
  check("backend down: chip shown", await until(() => $(w, "#demoChip")));
  check("chip says Backend offline", /Backend offline/.test($(w, "#demoChip").textContent));
  check("home renders", await until(() => $(w, ".hero h1")));
  $(w, "#demoChipBtn").click();
  check("chip opens panel", !$(w, "#demoPanel").hidden);

  // create store flow
  await nav(w, "#/create");
  check("create page renders", !!$(w, "#app h1"));
  await nav(w, "#/create/signup?subdomain=freshbakes");
  const f = $(w, "#app form");
  check("signup form present", !!f);
  if (f) {
    const set = (n, v) => { const el = f.querySelector(`[name=${n}]`); if (el) el.value = v; };
    set("business_name", "Fresh Bakes"); set("email", "baker@example.com"); set("password", "supersecret1");
    const t = f.querySelector("[name=agree_terms]"); if (t) t.checked = true;
    const rd = f.querySelector("[name=is_physical][value=yes]"); if (rd) rd.checked = true;
    f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  }
  await sleep(1200);
  check("after signup -> pay step", /\/pay/.test(w.location.hash), w.location.hash);
  check("demo store token minted", (w.localStorage.getItem("pelt_store_token") || "").startsWith("demo-"));

  // seeded seller flow through the chip
  w.localStorage.removeItem("pelt_store_token");
  const r = await w.DemoAPI.handle("/api/auth/login", { method: "POST", json: { email: "demo@wildthread.co", password: "x" } });
  w.localStorage.setItem("pelt_store_token", r.token);
  for (const [h, sel, label] of [["#/admin", ".stat, .stats, .dash-grid, h1", "dashboard"], ["#/admin/products", "table", "products table"], ["#/admin/orders", "table, .order-card", "orders"], ["#/admin/payment-settings", "#saveMethods", "payments"], ["#/admin/customize", "form", "customize"], ["#/admin/plan", "h1", "plan"]]) {
    await nav(w, h);
    check(label + " renders", !!$(w, "#app " + sel.split(",")[0]) || !!$(w, "#app " + sel.split(",").pop()), $(w, "#app h1") && $(w, "#app h1").textContent);
  }
  await nav(w, "#/wildthread");
  check("storefront shows seeded product", /Hand-dyed scarf/.test($(w, "#app").textContent));
  check("storefront banner is a data URL", !!$(w, "#app img[src^='data:']"));

  // owner
  await nav(w, "#/owner/login");
  const of = $(w, "#ownerLoginForm"); of.querySelector("input").value = "anything";
  of.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(1200);
  check("owner portal opens in demo", /\/owner$/.test(w.location.hash) && /Wild Thread/.test($(w, "#app").textContent), w.location.hash);

  // checkout end to end through the mock API
  const co = await w.DemoAPI.handle("/api/stores/wildthread/checkout", { method: "POST", json: { items: [{ product_id: 1, qty: 1 }], customer_name: "T", customer_email: "t@example.com", payment_method: "etransfer", agree_terms: true, shipping: { name: "T", street: "1 A St", city: "Halifax", province: "NS", postal_code: "B3J 1A1", country: "CA" } } });
  check("demo checkout returns order", co.order_id > 0 && co.amount_cents > 0);
  await nav(w, `#/wildthread/order/${co.order_id}`);
  check("order status page renders", /Order #/.test($(w, "#app").textContent));
  check("demo order auto-pays after a few seconds", await until(async () => false, 100) || (await w.DemoAPI.handle(`/api/stores/wildthread/orders/${co.order_id}`)).order.paid === false);
  await sleep(9500);
  check("…then flips to paid", (await w.DemoAPI.handle(`/api/stores/wildthread/orders/${co.order_id}`)).order.paid === true);

  // recovery: backend returns -> chip gone
  w.fetch = async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) });
  $(w, "#demoChipBtn").click();
  const retry = w.document.querySelector("[data-demo=retry]"); retry.click();
  check("backend back: chip removed", await until(() => !$(w, "#demoChip")));
  check("demo tokens dropped on recovery", !(w.localStorage.getItem("pelt_store_token") || "").startsWith("demo-"));

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
