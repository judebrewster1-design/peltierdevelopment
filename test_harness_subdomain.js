// Simulates a browser sitting on a real seller subdomain (bracelets.peltdev.com)
// rather than the platform's own domain - jsdom lets us set an arbitrary
// hostname via the `url` option, which is exactly what HOST_SUBDOMAIN reads.
// jsdom does NOT support navigating to a different origin mid-test (confirmed:
// it logs "Not implemented: navigation to another Document" and no-ops), so
// each hostname we need to test gets its own fresh JSDOM instance instead of
// trying to redirect one window between origins.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const appJsRaw = fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  .replace('return "https://REPLACE-WITH-YOUR-CLOUDFLARE-TUNNEL-URL";', 'return "http://localhost:5000";');

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function bootWindow(urlStr) {
  const dom = new JSDOM(html, { url: urlStr, runScripts: "dangerously", resources: "usable", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = fetch;
  window.FormData = class extends FormData {
    constructor(formEl) {
      super();
      if (formEl && formEl.tagName === "FORM") {
        Array.from(formEl.elements).forEach((el) => {
          if (!el.name) return;
          if (el.type === "file") { if (el.files && el.files[0]) this.append(el.name, el.files[0]); }
          else if (el.type === "checkbox" || el.type === "radio") { if (el.checked) this.append(el.name, el.value); }
          else this.append(el.name, el.value);
        });
      }
    }
  };
  window.onerror = (msg) => console.error("window.onerror:", msg);
  const scriptEl = window.document.createElement("script");
  scriptEl.textContent = appJsRaw;
  window.document.body.appendChild(scriptEl);
  return window;
}

const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " - " + name + (extra ? ` (${extra})` : ""));
}

async function run() {
  // ---- Part 1: pure routing-logic checks on an arbitrary subdomain ----
  const w1 = bootWindow("http://subdomtest.peltdev.com/");
  await sleep(300);

  check("HOST_SUBDOMAIN correctly detected from hostname", w1.eval("HOST_SUBDOMAIN") === "subdomtest", w1.eval("HOST_SUBDOMAIN"));
  check("API_BASE still resolves for local dev regardless of hostname", w1.eval("API_BASE") === "http://localhost:5000");
  check("storeLink() for OUR OWN subdomain is same-origin", w1.eval('storeLink("subdomtest", "/checkout")') === "#/checkout", w1.eval('storeLink("subdomtest", "/checkout")'));
  check("storeLink() for a DIFFERENT store is cross-origin", w1.eval('storeLink("othershop", "/checkout")') === "http://othershop.peltdev.com/#/checkout", w1.eval('storeLink("othershop", "/checkout")'));
  check("storeHash() for our own subdomain has no subdomain in it", w1.eval('storeHash("subdomtest", "/order/5")') === "/order/5");
  check("storeHash() for a different store includes it", w1.eval('storeHash("othershop", "/order/5")') === "/othershop/order/5");

  w1.location.hash = "#/";
  await sleep(500);
  const w1Text = () => w1.document.body.textContent;
  check("bare '/' on a subdomain with no matching store shows 'Not found', not a crash", w1Text().includes("Not found"), w1Text().slice(0, 120));
  check("bare '/' did NOT render the platform homepage hero", !w1.document.querySelector(".hero"));

  w1.location.hash = "#/story";
  await sleep(400);
  check("platform pages ('/story') still reachable by hash even while on a subdomain", w1Text().includes("Keep what you"));

  // ---- Part 2: a real store, viewed on its own real subdomain from the start ----
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const name = "subd" + Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * 26)]).join("");
  const signupRes = await fetch("http://localhost:5000/api/signup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subdomain: name, business_name: "Subdomain Test Shop", email: name + "@test.com", password: "testpass123", is_physical: false, agree_terms: true }),
  });
  const signupData = await signupRes.json();
  check("test store created via the real API", signupRes.status === 200 && !!signupData.token, JSON.stringify(signupData).slice(0, 150));

  const { execSync } = require("child_process");
  const dbPath = path.join(__dirname, "..", "backend", "peltdev.db");
  execSync(`python3 -c "import sqlite3; c=sqlite3.connect('${dbPath}'); c.execute(\\"UPDATE stores SET setup_paid=1, paypal_me='subdtest' WHERE subdomain='${name}'\\"); c.commit()"`);

  const w2 = bootWindow(`http://${name}.peltdev.com/`);
  await sleep(300);
  check("second window correctly detects its OWN subdomain from its own hostname", w2.eval("HOST_SUBDOMAIN") === name, w2.eval("HOST_SUBDOMAIN"));

  w2.location.hash = "#/";
  await sleep(600);
  const w2Text = () => w2.document.body.textContent;
  check("landing on the store's real subdomain shows THAT store, not a 404", w2Text().includes("Subdomain Test Shop"), w2Text().slice(0, 200));
  check("the URL has no subdomain baked into the hash", !w2.location.hash.includes(name));

  w2.location.hash = "#/checkout";
  await sleep(500);
  check("bare '#/checkout' resolves correctly on a real subdomain, no subdomain needed in the hash", !!w2.document.querySelector("#checkoutForm"), w2Text().slice(0, 150));

  global.__results = results;
}

run().then(() => {
  const failed = global.__results.filter((r) => !r.pass);
  console.log(`\n${global.__results.length} checks run, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}).catch((err) => {
  console.error("Subdomain test harness crashed:", err);
  process.exit(1);
});
