"use strict";
/*
 * Peltier Development - frontend SPA.
 *
 * No build step, no framework, no bundler - plain JS, loaded as a single
 * script tag from index.html. That's a deliberate choice for a project this
 * size: anyone can open this file and read exactly what it does, top to
 * bottom, with nothing hidden behind tooling. If this app grows a lot, a
 * framework becomes worth the tradeoff; today it isn't.
 *
 * ============================================================================
 * CONFIGURE THIS BEFORE DEPLOYING - the one thing you MUST edit:
 * ============================================================================
 */
const API_BASE = (function () {
  // Auto-detects localhost for local development. For a real deployment,
  // replace the string below with your actual backend URL - e.g. the
  // Cloudflare Tunnel address you get from `cloudflared tunnel run` or a
  // named tunnel's hostname, such as "https://api.yourdomain.com".
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }
  return "https://REPLACE-WITH-YOUR-CLOUDFLARE-TUNNEL-URL";
})();

// Your real domain - must match ROOT_DOMAIN in the backend's .env. Used here
// purely to recognize "is the browser sitting on a seller's own subdomain
// right now" before any network call has even happened - see HOST_SUBDOMAIN
// below and cloudflare-worker.js, which is what makes <name>.yourdomain.com
// actually reach this same app.js in the first place.
const ROOT_DOMAIN = "peltdev.com";

// If the browser is on <something>.peltdev.com (a seller's real subdomain,
// not the bare domain or "www"), this is that seller's subdomain name and
// the app runs in "storefront mode" - see the routing setup near the bottom
// of this file. Everywhere else (peltdev.com itself, localhost, a
// still-unmigrated old #/<subdomain> link) it's null and the app runs in its
// normal "platform mode".
const HOST_SUBDOMAIN = (function () {
  const host = location.hostname;
  if (host === ROOT_DOMAIN || host === "www." + ROOT_DOMAIN) return null;
  if (host === "localhost" || host === "127.0.0.1") return null;
  if (host.endsWith("." + ROOT_DOMAIN)) {
    const sub = host.slice(0, -(ROOT_DOMAIN.length + 1));
    if (sub && sub !== "www") return sub;
  }
  return null;
})();

/**
 * A link to a store's storefront (or a path within it, like "/checkout").
 * If we're already sitting on that store's own subdomain, this is just a
 * same-page hash - no need to say who we are, the hostname already does. If
 * we're on the main platform domain (the admin dashboard linking out to
 * "your storefront", say), this builds the full cross-origin URL instead,
 * since a bare "#/checkout" from peltdev.com would try to check out on the
 * platform site itself rather than sending anyone to the actual store.
 */
function storeLink(subdomain, hashPath = "") {
  const hash = hashPath ? (hashPath.startsWith("/") ? hashPath : "/" + hashPath) : "";
  if (HOST_SUBDOMAIN === subdomain) return "#" + hash;
  return `${location.protocol}//${subdomain}.${ROOT_DOMAIN}/#${hash}`;
}

// ---------------------------------------------------------------- auth state
//
// A bearer token in localStorage, not a cookie - see backend/security.py for
// why (cross-origin cookies between GitHub Pages and a tunneled API are
// fragile; a header the browser never attaches automatically sidesteps that
// entirely, along with the CSRF concerns cookie auth would otherwise raise).

const Auth = {
  getStoreToken() { return localStorage.getItem("pelt_store_token"); },
  setStoreToken(t) { t ? localStorage.setItem("pelt_store_token", t) : localStorage.removeItem("pelt_store_token"); },
  getOwnerToken() { return localStorage.getItem("pelt_owner_token"); },
  setOwnerToken(t) { t ? localStorage.setItem("pelt_owner_token", t) : localStorage.removeItem("pelt_owner_token"); },
};

// ---------------------------------------------------------------- demo mode
//
// When the backend can't be reached, the site flips into a self-contained demo
// (demo-api.js) so the whole flow stays explorable, with a small chip saying so.
// When the backend is reachable, none of this is visible.

function assetUrl(p) {
  if (!p) return "";
  return /^(data:|https?:|blob:)/i.test(p) ? p : API_BASE + "/" + p;
}

const Demo = {
  active: false,
  available: typeof DemoAPI !== "undefined",
  async probe() {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try { const r = await fetch(API_BASE + "/api/meta", { signal: ctl.signal }); return r.ok; }
    catch (e) { return false; }
    finally { clearTimeout(t); }
  },
  set(active, { render = true } = {}) {
    if (active && !this.available) return;
    if (this.active === active) { this.paint(); return; }
    this.active = active;
    _metaCache = null;
    if (!active) {
      // Back online: demo sessions mean nothing to the real server.
      if ((Auth.getStoreToken() || "").startsWith("demo-")) Auth.setStoreToken(null);
      if ((Auth.getOwnerToken() || "").startsWith("demo-")) Auth.setOwnerToken(null);
    }
    this.paint();
    if (render) { renderRoute(); updateNav(); }
    clearInterval(this._t);
    if (active) this._t = setInterval(async () => { if (await this.probe()) { this.set(false); flash("The backend is back online. Switched to live data."); } }, 10000);
  },
  go(hash) { location.hash = hash; if (location.hash === "#" + hash.replace(/^#/, "")) renderRoute(); this.panel(false); },
  panel(open) {
    const p = document.getElementById("demoPanel"), b = document.getElementById("demoChipBtn");
    if (!p) return;
    p.hidden = !open; b.setAttribute("aria-expanded", String(open));
  },
  paint() {
    let root = document.getElementById("demoChip");
    if (!this.active) { if (root) root.remove(); document.body.classList.remove("demo-on"); return; }
    document.body.classList.add("demo-on");
    if (root) return;
    root = document.createElement("div");
    root.id = "demoChip";
    root.innerHTML = `
      <div id="demoPanel" class="demo-panel" hidden role="dialog" aria-label="Demo mode">
        <div class="demo-panel-head">
          <strong>Demo mode</strong>
          <button type="button" class="demo-x" data-demo="close" aria-label="Close">&times;</button>
        </div>
        <p>The server is offline right now, so you're seeing sample data stored only in this browser. Nothing is sent anywhere and no money moves. Everything works, so go explore.</p>
        <div class="demo-steps-h">Jump to a step</div>
        <ol class="demo-steps">
          <li><a href="#/" data-demo="go">Homepage</a></li>
          <li><a href="#/create" data-demo="go">Create a store</a><span>name, sign up, setup fee</span></li>
          <li><a href="#/admin" data-demo="seller">Seller dashboard</a><span>as Wild Thread Co.</span></li>
          <li><a href="#/admin/products" data-demo="seller">Products</a></li>
          <li><a href="#/admin/payment-settings" data-demo="seller">Get paid</a></li>
          <li><a href="#/admin/customize" data-demo="seller">Customize</a></li>
          <li><a href="#/admin/orders" data-demo="seller">Orders</a></li>
          <li><a href="#/wildthread" data-demo="go">Public storefront</a><span>add to cart, then check out</span></li>
          <li><a href="#/owner" data-demo="owner">Owner portal</a><span>any password</span></li>
        </ol>
        <div class="demo-actions">
          <button type="button" class="btn btn-ghost small" data-demo="retry">Retry connection</button>
          <button type="button" class="btn btn-ghost small" data-demo="reset">Reset demo data</button>
        </div>
      </div>
      <button type="button" id="demoChipBtn" class="demo-chip" aria-expanded="false" aria-controls="demoPanel">
        <span class="demo-dot" aria-hidden="true"></span><span><b>Backend offline</b> &middot; Demo mode</span><span class="demo-caret" aria-hidden="true">Explore</span>
      </button>`;
    document.body.appendChild(root);
    document.getElementById("demoChipBtn").addEventListener("click", () => this.panel(document.getElementById("demoPanel").hidden));
    root.addEventListener("click", async (e) => {
      const el = e.target.closest("[data-demo]"); if (!el) return;
      const act = el.dataset.demo;
      if (act === "close") return this.panel(false);
      if (act === "go") { this.panel(false); return; }
      if (act === "seller" || act === "owner") {
        e.preventDefault();
        DemoAPI.load();
        if (act === "owner") Auth.setOwnerToken("demo-owner");
        else if (!(Auth.getStoreToken() || "").startsWith("demo-")) {
          const r = await DemoAPI.handle("/api/auth/login", { method: "POST", json: { email: "demo@wildthread.co", password: "x" } });
          Auth.setStoreToken(r.token);
        }
        const target = el.getAttribute("href");
        this.panel(false);
        if (location.hash === target) renderRoute(); else location.hash = target;
        updateNav();
        return;
      }
      if (act === "retry") {
        el.disabled = true; el.textContent = "Checking…";
        if (await this.probe()) { this.set(false); flash("Backend is online. Switched to live data."); }
        else { el.disabled = false; el.textContent = "Retry connection"; flash("Still offline. Staying in demo mode.", "error"); }
        return;
      }
      if (act === "reset") { DemoAPI.reset(); Auth.setStoreToken(null); Auth.setOwnerToken(null); this.panel(false); location.hash = "#/"; renderRoute(); updateNav(); flash("Demo data reset."); }
    });
  },
};

// ---------------------------------------------------------------- API helper

async function apiFetch(path, { method = "GET", json = null, form = null, auth = null } = {}) {
  if (Demo.active) return demoFetch(path, { method, json, form, auth });
  const headers = {};
  let body = null;
  if (json !== null) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form !== null) {
    body = form; // FormData - browser sets its own multipart Content-Type
  }
  if (auth === "store") {
    const t = Auth.getStoreToken();
    if (t) headers["Authorization"] = "Bearer " + t;
  } else if (auth === "owner") {
    const t = Auth.getOwnerToken();
    if (t) headers["Authorization"] = "Bearer " + t;
  }

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body });
  } catch (err) {
    // Server vanished mid-session: drop into demo mode instead of an error page.
    if (Demo.available && !Demo.active) { Demo.set(true, { render: false }); return demoFetch(path, { method, json, form, auth }); }
    throw { networkError: true, message: "Couldn't reach the server. Check the API is running and API_BASE in app.js is correct." };
  }

  const isCsv = (res.headers.get("Content-Type") || "").includes("text/csv");
  if (isCsv) return res; // caller handles blob/download directly

  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body, e.g. some 204s */ }

  if (res.status === 401 && auth === "store") { Auth.setStoreToken(null); }
  if (res.status === 401 && auth === "owner") { Auth.setOwnerToken(null); }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function demoFetch(path, opts) {
  try {
    return await DemoAPI.handle(path, opts);
  } catch (err) {
    if (err && err.status === 401 && opts.auth === "store") Auth.setStoreToken(null);
    if (err && err.status === 401 && opts.auth === "owner") Auth.setOwnerToken(null);
    throw err;
  }
}

// ---------------------------------------------------------------- small utilities

function money(cents) {
  return "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function flash(message, isError = false) {
  const stack = document.getElementById("flashStack");
  const el = document.createElement("div");
  el.className = "flash" + (isError ? " flash-error" : "");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// Cached platform meta (plans, cutoff date, customization catalogs) - fetched
// once and reused, since it changes only when the backend's own config does.
let _metaCache = null;
async function getMeta() {
  if (_metaCache) return _metaCache;
  _metaCache = await apiFetch("/api/meta");
  return _metaCache;
}

// ---------------------------------------------------------------- router
//
// Hash-based (#/admin/products, not /admin/products) on purpose: GitHub Pages
// serves static files with no server-side rewrite rules, so a real path-based
// route like /admin/products would 404 on a hard refresh unless you add a
// 404.html fallback trick. Hash routing needs none of that - the part after
// # never even reaches GitHub's servers.

const routes = []; // { pattern: RegExp, keys: [...], handler: fn }

function route(pathPattern, handler) {
  const keys = [];
  const regexStr = pathPattern.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; });
  routes.push({ pattern: new RegExp("^" + regexStr + "$"), keys, handler });
}

async function renderRoute() {
  const hash = location.hash.slice(1) || "/";
  const [pathPart] = hash.split("?");
  for (const r of routes) {
    const m = r.pattern.exec(pathPart);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      const app = document.getElementById("app");
      resetStoreLook();
      app.innerHTML = '<p class="muted" style="text-align:center;padding:3rem 0;">Loading…</p>';
      window.scrollTo(0, 0);
      try {
        await r.handler(params, app);
      } catch (err) {
        console.error(err);
        app.innerHTML = `<section class="funnel-step"><h1>Something went wrong</h1><p class="muted">${escapeHtml(err.message || "Unknown error")}</p></section>`;
      }
      updateNav();
      return;
    }
  }
  resetStoreLook();
  document.getElementById("app").innerHTML = '<section class="funnel-step"><h1>Not found</h1><a href="#/">&larr; Home</a></section>';
}

function updateNav() {
  const loggedIn = !!Auth.getStoreToken();
  const loginLink = document.getElementById("navLogin");
  const signupLink = document.getElementById("navSignup");
  if (loggedIn) {
    loginLink.textContent = "Log out"; loginLink.href = "#/logout";
    signupLink.textContent = "My store"; signupLink.href = "#/admin";
  } else {
    loginLink.textContent = "Log in"; loginLink.href = "#/login";
    signupLink.textContent = "Start your store"; signupLink.href = "#/create";
  }
  const yr = document.getElementById("yr"); if (yr) yr.textContent = new Date().getFullYear();
  // On a seller's own subdomain the page is THEIR shop, so tone down our chrome.
  document.body.classList.toggle("on-storefront", !!document.querySelector(".storefront, .store-scope"));
  closeNavMenu();
  document.body.classList.add("ready");
}

function closeNavMenu() {
  const nav = document.getElementById("siteNav"), t = document.getElementById("navToggle");
  if (nav) nav.classList.remove("open");
  if (t) t.setAttribute("aria-expanded", "false");
}
(function wireNavToggle() {
  const t = document.getElementById("navToggle");
  if (!t) return;
  t.addEventListener("click", () => {
    const open = document.getElementById("siteNav").classList.toggle("open");
    t.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();

/** Progress dots for the create-a-store funnel: 1 Name, 2 Account, 3 Setup fee, 4 Get paid. */
function funnelSteps(current) {
  const labels = ["Name", "Account", "Setup fee", "Get paid"];
  return `<ol class="stepper" aria-label="Progress">${labels.map((l, i) => `<li class="${i + 1 < current ? "done" : i + 1 === current ? "now" : ""}" ${i + 1 === current ? 'aria-current="step"' : ""}><span class="stepper-dot">${i + 1 < current ? "&#10003;" : i + 1}</span><span class="stepper-label">${l}</span></li>`).join("")}</ol>`;
}

window.addEventListener("hashchange", renderRoute);

// ---------------------------------------------------------------- Helcim payment helper
//
// Same flow used everywhere money moves in this app (setup fee, Growth/Scale
// plan payments, Scale invoices, order checkout): load HelcimPay.js once,
// open its iframe with a checkout token from our own backend's /init
// endpoint, listen for its postMessage result, then call our backend's
// /confirm endpoint - which re-verifies with Helcim server-side before
// anything is ever marked paid. The frontend never decides a payment
// succeeded; it only relays what Helcim's own script reports, and the
// backend is the only thing that actually trusts that.

let _helcimScriptLoaded = false;
function loadHelcimScript() {
  return new Promise((resolve, reject) => {
    if (_helcimScriptLoaded) return resolve();
    const s = document.createElement("script");
    s.src = "https://secure.helcim.app/helcim-pay/services/start.js";
    s.onload = () => { _helcimScriptLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("Couldn't load the Helcim payment script."));
    document.body.appendChild(s);
  });
}

/**
 * initPath: backend endpoint returning {checkoutToken, paymentRef}
 * confirmPath: backend endpoint accepting {transactionId, paymentRef}
 * auth: "store" | null (order payments are unauthenticated - anyone with the order link)
 * onDone(ok, error): called once, after confirm resolves either way
 */
async function runHelcimPay({ initPath, confirmPath, auth, onDone }) {
  if (Demo.active) {
    flash("Demo card payment approved.");
    try { await apiFetch(confirmPath, { method: "POST", auth, json: { transactionId: "demo", paymentRef: "demo" } }); onDone(true); } catch (e) { onDone(false, e.message); }
    return;
  }
  await loadHelcimScript();
  let initData;
  try {
    initData = await apiFetch(initPath, { method: "POST", auth });
  } catch (err) {
    onDone(false, err.message);
    return;
  }
  const { checkoutToken, paymentRef } = initData;
  appendHelcimPayIframe(checkoutToken);

  const handler = async (event) => {
    const key = "helcim-pay-js-" + checkoutToken;
    if (!event.data || event.data.eventName !== key) return;
    if (event.data.eventStatus === "ABORTED") {
      window.removeEventListener("message", handler);
      onDone(false, "Payment cancelled.");
      return;
    }
    if (event.data.eventStatus === "SUCCESS") {
      window.removeEventListener("message", handler);
      let txResponse = {};
      try { txResponse = event.data.eventMessage ? JSON.parse(event.data.eventMessage) : {}; } catch (e) {}
      const transactionId = (txResponse.data && txResponse.data.data) ? txResponse.data.data.transactionId : txResponse.transactionId;
      try {
        const confirmData = await apiFetch(confirmPath, { method: "POST", auth, json: { transactionId, paymentRef } });
        onDone(!!confirmData.ok, confirmData.error);
      } catch (err) {
        onDone(false, err.message);
      }
    }
  };
  window.addEventListener("message", handler);
}

// ============================================================================
// VIEWS: public pages
// ============================================================================

route("/", async (params, app) => {
  if (HOST_SUBDOMAIN) return renderStorefront(app, HOST_SUBDOMAIN);
  const meta = await getMeta();
  const dollars = (c) => "$" + (c / 100).toLocaleString("en-CA", { maximumFractionDigits: 0 });
  const planBlurb = (p) => p.kind === "usage"
    ? "Unlimited sales. 1% of what you sell, with a $" + p.price_dollars.toFixed(0) + "/mo minimum."
    : "Up to " + dollars(p.cap_cents) + " in sales per month.";
  const check = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icon = {
    wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 012-2h13v3M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-9a1 1 0 00-1-1H5a2 2 0 01-2-2zM16 13.5h.01"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3zM9 12l2 2 4-4"/></svg>',
    tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l9 9-8 8-9-9zM7.5 8.5h.01"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z"/></svg>',
    brush: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4l-9 9m0 0c-2-1-4 .5-4 3 0 1.5-1 3-3 4 4 1 9 .5 9-4 0-1-.5-2-2-3zM15 6l3 3"/></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/></svg>',
  };
  app.innerHTML = `
    <section class="hero hero-split">
      <div class="hero-copy">
        <p class="eyebrow">Online stores for small sellers</p>
        <h1>Sell online. Keep the fee out of it.</h1>
        <p class="lede">Launch a real storefront at <strong>yourshop.${escapeHtml(meta.root_domain)}</strong> in minutes. Customers pay you directly, and we never take a cut of your sales on the Starter and Growth plans.</p>
        <div class="hero-cta">
          <a class="btn btn-primary btn-lg" href="#/create">Start your store</a>
          <a class="btn btn-ghost btn-lg" href="#/story">Why we built this</a>
        </div>
        <ul class="hero-points">
          <li>${check} $25 one-time setup</li>
          <li>${check} Free plan, no monthly fee</li>
          <li>${check} Pay by e-Transfer or PayPal</li>
        </ul>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="mock-window">
          <div class="mock-bar"><i></i><i></i><i></i><span>bracelets.${escapeHtml(meta.root_domain)}</span></div>
          <div class="mock-banner"></div>
          <div class="mock-body">
            <div class="mock-title">Wild Thread Co.</div>
            <div class="mock-sub">Handmade bracelets and keychains</div>
            <div class="mock-grid"><div><b></b><span>Beaded bracelet</span><em>$18.00</em></div><div><b></b><span>Linen tote</span><em>$26.00</em></div><div><b></b><span>Keychain</span><em>$9.00</em></div></div>
            <div class="mock-btn">Order</div>
          </div>
        </div>
        <div class="mock-chip mock-chip-a">${check} Payment received</div>
        <div class="mock-chip mock-chip-b">$0 platform fee</div>
      </div>
    </section>

    <section class="trust-strip" aria-label="Why sellers trust us">
      <div><span class="ti">${icon.wallet}</span><div><strong>Paid straight to you</strong><span>We never hold your money</span></div></div>
      <div><span class="ti">${icon.shield}</span><div><strong>No card details stored</strong><span>Payments run through your own accounts</span></div></div>
      <div><span class="ti">${icon.tag}</span><div><strong>Fees shown up front</strong><span>See what every method costs</span></div></div>
      <div><span class="ti">${icon.globe}</span><div><strong>Your own web address</strong><span>name.${escapeHtml(meta.root_domain)}</span></div></div>
    </section>

    <section class="section">
      <div class="section-head"><p class="eyebrow">How it works</p><h2>From idea to first order in four steps</h2></div>
      <ol class="steps-grid">
        <li><span class="step-n">1</span><h3>Pick a name</h3><p>Choose your store name. It becomes your own address, checked live so you know it's yours.</p></li>
        <li><span class="step-n">2</span><h3>Open the doors</h3><p>Create your account and pay the one-time $25 setup fee. That's the only thing you pay to start.</p></li>
        <li><span class="step-n">3</span><h3>Choose how you get paid</h3><p>Turn on e-Transfer, PayPal, or both. Each one shows its real fees before you pick.</p></li>
        <li><span class="step-n">4</span><h3>Add products and share</h3><p>List what you sell, pick a theme, and send customers your link. You're live.</p></li>
      </ol>
    </section>

    <section class="section">
      <div class="section-head"><p class="eyebrow">Everything included</p><h2>A real store, not a link in your bio</h2></div>
      <div class="feature-grid">
        <div class="feature"><span class="ti">${icon.brush}</span><h3>9 designer themes</h3><p>One click sets colors, fonts, layout and buttons. Then fine-tune anything, with a live preview.</p></div>
        <div class="feature"><span class="ti">${icon.bolt}</span><h3>Payments that confirm themselves</h3><p>Turn on auto-confirm and paid orders flip to paid on their own. No checking your inbox.</p></div>
        <div class="feature"><span class="ti">${icon.box}</span><h3>Shipping built in</h3><p>Collect real addresses, set where you ship and a flat rate, and see everything in one order list.</p></div>
        <div class="feature"><span class="ti">${icon.globe}</span><h3>Your own address</h3><p>Customers visit yourshop.${escapeHtml(meta.root_domain)}. No ads, no marketplace, just your brand.</p></div>
        <div class="feature"><span class="ti">${icon.chart}</span><h3>Simple dashboard</h3><p>Orders, revenue and a getting-started checklist so you always know the next step.</p></div>
        <div class="feature"><span class="ti">${icon.shield}</span><h3>Secure by default</h3><p>Hashed sessions, login lockouts, encrypted credentials and an audit log behind every account.</p></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><p class="eyebrow">Pricing</p><h2>Pay for the tools, not for your success</h2><p class="section-sub">Start free. Upgrade only if your sales outgrow the limit.</p></div>
      <div class="plan-grid">
        ${meta.plan_order.map((key) => {
          const p = meta.plans[key];
          const price = p.kind === "usage" ? "1%<span>/sale</span>" : (p.price_dollars ? "$" + p.price_dollars.toFixed(0) + "<span>/mo</span>" : "Free");
          return `<div class="plan-card plan-card-${key}${key === "starter" ? " plan-popular" : ""}">
            ${key === "starter" ? '<span class="plan-flag">Best to start</span>' : ""}
            <h3>${escapeHtml(p.label)}</h3>
            <p class="plan-price">${price}</p>
            <p class="plan-blurb">${escapeHtml(planBlurb(p))}</p>
            <ul class="plan-list"><li>${check} Your own storefront</li><li>${check} e-Transfer and PayPal checkout</li><li>${check} ${key === "starter" ? "No per-sale fee from us" : key === "growth" ? "No per-sale fee from us" : "Unlimited transactions"}</li></ul>
          </div>`;
        }).join("")}
      </div>
      <p class="fine-print">Setup is a one-time $25 CAD. PayPal charges its own fees on PayPal sales; Interac e-Transfer has none from us. <a href="#/story">Read how we think about fees</a>.</p>
    </section>

    <section class="section">
      <div class="section-head"><p class="eyebrow">Questions</p><h2>Straight answers</h2></div>
      <div class="faq">
        <details><summary>Do you take a cut of my sales?</summary><p>Not on Starter or Growth. Scale is a flat 1% of what you sell with a monthly minimum. The plan details are always shown before you pay anything.</p></details>
        <details><summary>How do I actually get paid?</summary><p>Customers pay you directly by Interac e-Transfer or PayPal (and optionally card through your own Helcim account). The money goes to you, never through us.</p></details>
        <details><summary>Is it safe for my customers?</summary><p>We never see or store card or bank details. Your checkout hands customers to your own payment accounts, and every store shows who the independent seller is.</p></details>
        <details><summary>Who is behind this?</summary><p>Peltier Development is a student-run entrepreneurship project. You'll reach a real person through <a href="#/support">Support</a>, and you can read our whole <a href="#/story">story</a> and <a href="#/terms">terms</a> before signing up.</p></details>
      </div>
    </section>

    <section class="cta-band">
      <h2>Ready to keep what you earn?</h2>
      <p>Pick your name and have a storefront live today.</p>
      <a class="btn btn-primary btn-lg" href="#/create">Start your store</a>
    </section>
  `;
});

route("/story", async (params, app) => {
  app.innerHTML = `
    <div class="story-page">
      <section class="story-hero">
        <p class="story-eyebrow">Our story</p>
        <h1>Keep what you <span class="hot">earn</span>.</h1>
        <p class="story-sub">Peltier Development is a student-built storefront platform, made around one question: what if the platform didn't take a slice of every sale?</p>
        <div class="story-chips">
          <span class="story-chip">🎓 Student-built</span>
          <span class="story-chip">🤝 Junior Achievement</span>
          <span class="story-chip">🔥 No per-sale cut on Starter</span>
        </div>
      </section>

      <section class="story-stats">
        <div class="story-stat"><b>$0</b><span>per-sale fees from us on Starter and Growth</span></div>
        <div class="story-stat"><b>Direct</b><span>buyers pay you — we never hold your money</span></div>
        <div class="story-stat"><b>Up front</b><span>every payment method's fees shown before you choose</span></div>
      </section>

      <section class="story-block">
        <h2>Where it started</h2>
        <p>Every online seller hits the same wall. You build something, you find customers — and then a slice of every sale quietly disappears. To the platform, to the payment processor, to a fee you didn't notice until it was already gone.</p>
        <p class="story-pull">We're students. We wanted to find out if it had to work that way.</p>
        <p>So we built Peltier Development as an entrepreneurship project to test one simple idea: give sellers a real storefront — products, checkout, orders, their own look and feel — and charge for the tools, not for their success.</p>
      </section>

      <section class="story-ja">
        <div class="story-ja-card">
          <p class="story-eyebrow">🤝 Junior Achievement</p>
          <h2>Learn it by doing it.</h2>
          <p>Junior Achievement is a non-profit that gets young people hands-on with entrepreneurship, financial literacy and work readiness. Peltier Development grew out of exactly that spirit: don't just read about business — start one, with real customers and real money on the line.</p>
          <p>JA taught us the part no textbook does: a business is a promise you keep to the people who trust it. So we built ours to be a promise you can read in full — what it costs, who gets paid, and where the money goes.</p>
          <p class="story-small">Junior Achievement is an independent non-profit. Peltier Development is our own student project.</p>
        </div>
      </section>

      <section class="story-block">
        <h2>What we stand for</h2>
      </section>
      <section class="story-pillars">
        <div class="story-pillar"><span class="n">01</span><h3>Your money goes to you</h3><p>Buyers pay your PayPal or your bank directly. We confirm the payment happened — we never hold it, so there's nothing to wait on and nothing to withdraw.</p></div>
        <div class="story-pillar"><span class="n">02</span><h3>Pay for tools, not for success</h3><p>Free to start. A flat plan when you outgrow it. Scale is a simple 1%, and it's written down before you ever sign up.</p></div>
        <div class="story-pillar"><span class="n">03</span><h3>Honest by default</h3><p>When you choose how to get paid, we put each method's real fees side by side. PayPal's cut and e-Transfer's $0 — no treasure hunt through the fine print.</p></div>
      </section>

      <section class="story-block">
        <h2>Why "Peltier"?</h2>
        <p>A Peltier device moves heat: one side runs hot while the other runs cold. Our red-and-blue mark is a nod to that — the hustle on one side, the results on the other, and the work of moving one into the other.</p>
      </section>

      <section class="story-block">
        <h2>What we're not</h2>
        <p>We're a small, student-run project, not a giant company. That means you'll reach a real person when you write to support — and it also means you should read our <a href="#/terms">terms</a> and decide whether we're the right fit. We'd rather earn your trust than assume it.</p>
      </section>

      <section class="story-cta">
        <h2>Ready to keep what you earn?</h2>
        <a class="btn btn-primary" href="#/create">Start your store</a>
        <a class="btn btn-ghost" href="#/support">Say hello</a>
      </section>
    </div>
  `;
});

route("/terms", async (params, app) => {
  app.innerHTML = `
    <section class="funnel-step">
      <h1>Terms</h1>
      <p>Every store on this platform is run by its own independent seller — not Peltier Development. We provide the storefront tooling; the seller is responsible for what they sell, order fulfillment, and their own tax obligations. Payments go directly to each seller's own PayPal or bank account.</p>
      <p>By creating a store, a seller agrees to the setup fee and plan terms described at signup and on the Plan page, and to represent their business accurately to customers.</p>
      <p>By placing an order, a buyer agrees that Peltier Development is not the seller of record — the store itself is — and that disputes about an order should go to that store first, and to <a href="#/support">Support</a> if unresolved.</p>
    </section>
  `;
});

route("/privacy", async (params, app) => {
  app.innerHTML = `
    <section class="funnel-step">
      <h1>Privacy</h1>
      <p>We store what's needed to run a store: your login, your store's content, and order records (so sellers can fulfill them). Payments go straight to sellers by PayPal or Interac e-Transfer — we never see or store card or bank account details. If a seller turns on automatic payment confirmation, we keep a read-only mailbox app password for them, encrypted, and use it only to look for bank and PayPal payment notifications.</p>
      <p>Seller credentials (mailbox app passwords and any payment keys) are encrypted at rest and only decrypted server-side when needed.</p>
      <p>Questions about your data — <a href="#/support">reach out through Support</a>.</p>
    </section>
  `;
});

route("/support", async (params, app) => {
  app.innerHTML = `
    <section class="funnel-step">
      <h1>Support</h1>
      <p class="lede">Question about your store, a purchase you made, or something broken? Send it here.</p>
      <form id="supportForm">
        <label class="field"><span class="field-label">Your email</span><input type="email" name="email" required></label>
        <label class="field"><span class="field-label">Store subdomain (if this is about a specific store)</span><input type="text" name="store_subdomain" placeholder="optional"></label>
        <label class="field"><span class="field-label">Subject</span><input type="text" name="subject"></label>
        <label class="field"><span class="field-label">Message</span><textarea name="message" rows="5" required></textarea></label>
        <button class="btn btn-primary full" type="submit">Send</button>
      </form>
    </section>
  `;
  qs("#supportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await apiFetch("/api/support", { method: "POST", json: Object.fromEntries(fd) });
      app.innerHTML = `<section class="funnel-step"><h1>Got it.</h1><p class="muted">We'll get back to you by email.</p><a class="btn btn-ghost" href="#/">&larr; Home</a></section>`;
    } catch (err) {
      flash(err.message, true);
    }
  });
});

// ============================================================================
// VIEWS: create-a-store funnel
// ============================================================================

route("/create", async (params, app) => {
  const meta = await getMeta();
  app.innerHTML = `
    <section class="funnel-step auth-card">
      ${funnelSteps(1)}
      <h1>Pick your store's name</h1>
      <p class="lede">Letters only, a to z. This becomes your storefront's web address.</p>
      <label class="field">
        <span class="field-label">Store name</span>
        <div class="input-suffix"><input type="text" id="subdomainInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="yourshop" autofocus><span>.${escapeHtml(meta.root_domain)}</span></div>
      </label>
      <p id="subdomainResult" class="hint" aria-live="polite"></p>
      <button class="btn btn-primary btn-lg full" id="continueBtn" disabled>Continue</button>
      <p class="auth-foot">Already have a store? <a href="#/login">Log in</a></p>
    </section>
  `;
  let checkedSubdomain = null;
  let debounceTimer = null;
  const input = qs("#subdomainInput");
  const resultEl = qs("#subdomainResult");
  const continueBtn = qs("#continueBtn");

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    continueBtn.disabled = true;
    checkedSubdomain = null;
    const val = input.value;
    if (!val.trim()) { resultEl.textContent = ""; return; }
    resultEl.textContent = "Checking…";
    debounceTimer = setTimeout(async () => {
      try {
        const data = await apiFetch("/api/subdomain-check", { method: "POST", json: { name: val } });
        if (!data.valid) {
          resultEl.textContent = data.error || "Letters only, please.";
        } else if (data.available) {
          resultEl.innerHTML = `<span class="ok-text">&#10003; <span class="mono">${escapeHtml(data.cleaned)}.${escapeHtml(meta.root_domain)}</span> is available</span>`;
          checkedSubdomain = data.cleaned;
          continueBtn.disabled = false;
        } else {
          resultEl.textContent = `${data.cleaned}.${meta.root_domain} is taken — try another.`;
        }
      } catch (err) {
        resultEl.textContent = "Couldn't check that right now.";
      }
    }, 350);
  });

  continueBtn.addEventListener("click", () => {
    if (checkedSubdomain) location.hash = "#/create/signup?subdomain=" + encodeURIComponent(checkedSubdomain);
  });
});

route("/create/signup", async (params, app) => {
  const hashQuery = new URLSearchParams((location.hash.split("?")[1] || ""));
  const subdomain = hashQuery.get("subdomain");
  const meta = await getMeta();
  if (!subdomain) { location.hash = "#/create"; return; }
  app.innerHTML = `
    <section class="funnel-step auth-card">
      ${funnelSteps(2)}
      <h1>Create your account</h1>
      <p class="lede">Setting up <strong class="mono">${escapeHtml(subdomain)}.${escapeHtml(meta.root_domain)}</strong></p>
      <form id="signupForm">
        <label class="field"><span class="field-label">Business name</span><input type="text" name="business_name" placeholder="${escapeHtml(subdomain)}" autocomplete="organization"></label>
        <label class="field"><span class="field-label">Your email</span><input type="email" name="email" required autocomplete="email"></label>
        <label class="field"><span class="field-label">Password</span><input type="password" name="password" required minlength="8" autocomplete="new-password"><span class="field-help">At least 8 characters.</span></label>
        <span class="field-label">What will you sell?</span>
        <div class="choice-cards">
          <label class="choice-card"><input type="radio" name="is_physical" value="yes" required><span><strong>Physical items</strong><small>We'll collect shipping addresses</small></span></label>
          <label class="choice-card"><input type="radio" name="is_physical" value="no"><span><strong>Digital or a service</strong><small>No shipping needed</small></span></label>
        </div>
        <label class="chip-radio agree-row">
          <input type="checkbox" name="agree_terms" required>
          I agree to the <a href="#/terms" target="_blank">Seller Terms</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>.
        </label>
        <button class="btn btn-primary btn-lg full" type="submit">Create my store</button>
      </form>
      <p class="auth-foot">Next: the one-time $25 setup fee. It's the only thing you pay to start.</p>
    </section>
  `;
  qs("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await apiFetch("/api/signup", {
        method: "POST",
        json: {
          subdomain, business_name: fd.get("business_name"), email: fd.get("email"),
          password: fd.get("password"), is_physical: fd.get("is_physical") === "yes",
          agree_terms: fd.get("agree_terms") === "on",
        },
      });
      Auth.setStoreToken(data.token);
      flash("Store created!");
      location.hash = "#/pay";
    } catch (err) {
      flash(err.message, true);
    }
  });
});

// ============================================================================
// VIEWS: store login / logout
// ============================================================================

route("/login", async (params, app) => {
  const next = new URLSearchParams(location.hash.split("?")[1] || "").get("next");
  app.innerHTML = `
    <section class="funnel-step auth-card">
      <h1>Welcome back</h1>
      <p class="lede">${next ? "Log in and we'll take you right back to where you were." : "Log in to your store."}</p>
      <form id="loginForm">
        <label class="field"><span class="field-label">Email</span><input type="email" name="email" required autofocus autocomplete="username"></label>
        <label class="field"><span class="field-label">Password</span><div class="pw-row"><input type="password" name="password" id="loginPw" required autocomplete="current-password"><button type="button" class="pw-toggle" id="loginPwToggle">Show</button></div></label>
        <button class="btn btn-primary btn-lg full" type="submit">Log in</button>
      </form>
      <p class="auth-foot">New here? <a href="#/create">Start your store</a></p>
    </section>
  `;
  qs("#loginPwToggle").addEventListener("click", (e) => {
    const i = qs("#loginPw"); i.type = i.type === "password" ? "text" : "password"; e.target.textContent = i.type === "password" ? "Show" : "Hide";
  });
  qs("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Logging in…";
    try {
      const data = await apiFetch("/api/auth/login", { method: "POST", json: { email: fd.get("email"), password: fd.get("password") } });
      Auth.setStoreToken(data.token);
      location.hash = !data.store.setup_paid ? "#/pay" : (next && next.startsWith("/") ? "#" + next : "#/admin");
    } catch (err) {
      flash(err.status === 429 ? err.message : (err.status === 401 ? "That email and password don't match. Double-check and try again." : err.message), true);
      btn.disabled = false; btn.textContent = "Log in";
    }
  });
});

route("/logout", async () => {
  try { await apiFetch("/api/logout", { method: "POST", auth: "store" }); } catch (e) {}
  Auth.setStoreToken(null);
  location.hash = "#/";
});

// ---------------------------------------------------------------- shared admin guards

function goLogin() {
  const here = location.hash.slice(1);
  location.hash = "#/login" + (here && !here.startsWith("/login") ? "?next=" + encodeURIComponent(here) : "");
}

async function requireStoreAuth() {
  if (!Auth.getStoreToken()) { goLogin(); return null; }
  try {
    const data = await apiFetch("/api/me", { auth: "store" });
    return data.store;
  } catch (err) {
    goLogin();
    return null;
  }
}

function adminNav(active) {
  const tabs = [
    ["admin", "Overview"], ["admin/products", "Products"], ["admin/orders", "Orders"],
    ["admin/customize", "Customize"], ["admin/payment-settings", "Payments"], ["admin/plan", "Plan"],
  ];
  return `<nav class="admin-tabs">
    ${tabs.map(([path, label]) => `<a class="${active === path ? "active" : ""}" ${active === path ? 'aria-current="page"' : ""} href="#/${path}">${label}</a>`).join("")}
  </nav>`;
}

// ---------------------------------------------------------------- setup fee

// ---------------------------------------------------------------- shared payment instructions (orders AND platform fees)

function renderDiagnosis(el, d) {
  el.innerHTML = `
    <ul class="diag">${d.checks.map((c) => `<li><span>${c.ok ? "✅" : "❌"}</span><div><strong>${escapeHtml(c.name)}</strong><br><span class="muted small">${escapeHtml(c.detail)}</span></div></li>`).join("")}</ul>
    <div class="result-card ${d.verdict === "paid" ? "result-good" : ""}"><p><strong>${escapeHtml(d.message)}</strong></p>
    ${d.waiting_for && d.waiting_for.length ? `<p class="muted small">Waiting on money: ${d.waiting_for.map((w) => `#${w.id} ${escapeHtml(w.method)} ${escapeHtml(w.amount)}`).join(" · ")}</p>` : ""}</div>`;
}

function testBoxHtml(id) {
  return `<details class="test-box"><summary>Test an email — paste a real receipt</summary>
    <p class="hint">In Gmail open the payment email, click ⋮, choose <strong>Show original</strong>, copy everything and paste it below. Nothing gets marked paid — it just tells you what would happen, and why.</p>
    <textarea id="${id}Raw" rows="8" placeholder="Paste the full email here"></textarea>
    <button type="button" class="btn btn-ghost small" id="${id}Btn">Check this email</button>
    <div id="${id}Out"></div></details>`;
}

function wireTestBox(id, path, auth) {
  qs(`#${id}Btn`).addEventListener("click", async () => {
    const out = qs(`#${id}Out`);
    out.innerHTML = '<p class="muted">Checking…</p>';
    try { renderDiagnosis(out, await apiFetch(path, { method: "POST", auth, json: { raw: qs(`#${id}Raw`).value } })); }
    catch (err) { out.innerHTML = `<p class="hint hint-error">${escapeHtml(err.message)}</p>`; }
  });
}

function startPolling(target, check, onPaid) {
  const t = setInterval(async () => {
    if (!document.body.contains(target)) { clearInterval(t); return; }   // user navigated away
    try { if (await check()) { clearInterval(t); onPaid(); } } catch (e) { /* keep trying */ }
  }, Demo.active ? 2500 : 10000);
}

function renderPayInstructions(target, o) {
  const extra = o.amountCents - o.baseCents;
  target.innerHTML = `
    <div class="pay-instructions">
      <p class="muted">Send exactly</p>
      <p class="pay-amount">${money(o.amountCents)} <span class="muted">CAD</span></p>
      <p class="hint">${extra > 0
        ? `That's ${money(o.baseCents)} plus ${money(extra)} extra. The exact amount is how your payment gets matched — please don't round it.`
        : "Send this exact amount — it's how your payment gets matched."}</p>
      ${o.method === "etransfer" ? `
        <p class="muted">to this e-Transfer email</p>
        <div class="copy-row"><code>${escapeHtml(o.email)}</code><button type="button" class="btn btn-ghost small" data-copy="${escapeHtml(o.email)}">Copy</button></div>
        <p class="muted">and put this code in the message box</p>
        <div class="copy-row"><code>${escapeHtml(o.ref)}</code><button type="button" class="btn btn-ghost small" data-copy="${escapeHtml(o.ref)}">Copy</button></div>
      ` : `
        <a class="btn btn-primary full" href="${escapeHtml(o.paypalLink)}" target="_blank" rel="noopener noreferrer">Pay ${money(o.amountCents)} with PayPal</a>
        <p class="hint">PayPal opens in a new tab with the amount already filled in. Don't change it.</p>
      `}
      <div class="wait-state"><span class="pulse-dot"></span> ${o.auto
        ? "Waiting for your payment — this page updates by itself the moment it lands."
        : "Once you've paid, " + escapeHtml(o.confirmer) + " confirms it. You can close this page and come back."}</div>
    </div>`;
  qsa("[data-copy]", target).forEach((btn) => btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1500); }
    catch (e) { btn.textContent = "Select & copy"; }
  }));
  if (o.auto && o.check) startPolling(target, o.check, o.onPaid);
}

async function renderPlatformPay(app, { kind, planKey, title, blurb, doneHash, stepper }) {
  const opts = await apiFetch("/api/platform-pay/options", { auth: "store" });
  const methods = Object.keys(opts.methods);
  if (!methods.length) {
    app.innerHTML = `<section class="funnel-step"><h1>${escapeHtml(title)}</h1><p class="lede">Payments for the platform itself aren't switched on yet. Please <a href="#/support">contact us</a> and we'll sort it out.</p></section>`;
    return;
  }
  const labels = {
    etransfer: ["Interac e-Transfer", "Send from your bank app. $0 in fees."],
    paypal: ["PayPal", "Pay on PayPal with your balance, bank or card."],
  };
  app.innerHTML = `
    <section class="funnel-step auth-card auth-card-wide">
      ${stepper ? funnelSteps(stepper) : ""}
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${escapeHtml(blurb)}</p>
      <span class="field-label">Pay with</span>
      <div class="pay-methods">
        ${methods.map((m) => `<button type="button" class="pay-card pay-choice" data-method="${m}"><div class="pay-card-head"><strong>${labels[m][0]}</strong></div><p class="muted small">${labels[m][1]}</p></button>`).join("")}
      </div>
      <div id="payArea"></div>
    </section>`;
  const area = qs("#payArea");
  async function choose(method) {
    qsa(".pay-choice").forEach((b) => b.classList.toggle("on", b.dataset.method === method));
    try {
      const r = await apiFetch("/api/platform-pay/start", { method: "POST", auth: "store", json: { kind, plan_key: planKey, method } });
      renderPayInstructions(area, {
        method: r.method, amountCents: r.amount_cents, baseCents: r.base_cents, email: r.email, paypalLink: r.paypal_link,
        ref: r.ref, auto: r.auto, confirmer: "the Peltier team",
        check: async () => (await apiFetch(`/api/platform-pay/${r.ref}`, { auth: "store" })).status === "paid",
        onPaid: () => { flash("Payment received — thank you!"); location.hash = doneHash; },
      });
    } catch (err) { flash(err.message, true); }
  }
  qsa(".pay-choice").forEach((b) => b.addEventListener("click", () => choose(b.dataset.method)));
  if (methods.length === 1) choose(methods[0]);
}

route("/pay", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  if (store.setup_paid) { location.hash = "#/admin"; return; }
  await renderPlatformPay(app, {
    kind: "setup_fee", title: "One-time setup fee", stepper: 3,
    blurb: "$25.00 CAD opens your store. Pay by e-Transfer (no fees) or PayPal. It confirms automatically.",
    doneHash: "#/admin/payment-settings?welcome=1",
  });
});

route("/admin/plan/upgrade/:planKey", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  if (!store.setup_paid) { location.hash = "#/pay"; return; }
  const preview = await apiFetch(`/api/plan/upgrade/${params.planKey}`, { auth: "store" });
  await renderPlatformPay(app, {
    kind: "plan_upgrade", planKey: params.planKey, title: `Upgrade to ${preview.plan.label}`,
    blurb: preview.credit_cents
      ? `Full price ${money(preview.full_price_cents)}, minus ${money(preview.credit_cents)} Helcim-fee credit = ${money(preview.charge_cents)}.`
      : `${money(preview.charge_cents)} CAD.` + (preview.plan.kind === "flat" ? " Your plan renews for 30 days." : " Scale then bills monthly, based on what you sold."),
    doneHash: "#/admin/plan",
  });
});

route("/admin/plan/invoice", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  await renderPlatformPay(app, {
    kind: "plan_invoice", title: "Pay your Scale invoice",
    blurb: "Your monthly Scale invoice — 1% of last month's sales, $49 minimum.", doneHash: "#/admin/plan",
  });
});

// ---------------------------------------------------------------- admin: dashboard

route("/admin", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  if (!store.setup_paid) { location.hash = "#/pay"; return; }
  const d = await apiFetch("/api/dashboard", { auth: "store" });

  // A getting-started checklist for new sellers - everything it checks is
  // already on `store` or `d`, so this costs no extra API calls. It quietly
  // stops rendering once every step is done, rather than nagging forever.
  const steps = [
    { done: true, label: "Store created", href: null },
    { done: true, label: "Setup fee paid", href: null },
    { done: d.payment_connected, label: "Connect a way to get paid", href: "#/admin/payment-settings", cta: "Set up payments" },
    { done: d.product_count > 0, label: "Add your first product", href: "#/admin/products", cta: "Add a product" },
    { done: !!(store.tagline || store.about_text || store.banner_image || store.logo_image), label: "Personalize your storefront", href: "#/admin/customize", cta: "Customize" },
  ];
  const remaining = steps.filter((s) => !s.done);
  const checklist = remaining.length ? `
    <div class="onboard-card">
      <div class="onboard-head">
        <span class="field-label">Getting your store ready</span>
        <span class="muted small">${steps.length - remaining.length} of ${steps.length} done</span>
      </div>
      <div class="onboard-bar"><div class="onboard-bar-fill" style="width:${((steps.length - remaining.length) / steps.length) * 100}%"></div></div>
      <ul class="onboard-list">
        ${steps.map((s) => `<li class="${s.done ? "done" : ""}"><span class="onboard-check">${s.done ? "✓" : ""}</span><span>${escapeHtml(s.label)}</span>${!s.done && s.href ? `<a class="btn btn-ghost small" href="${s.href}">${escapeHtml(s.cta)}</a>` : ""}</li>`).join("")}
      </ul>
    </div>` : "";

  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>${escapeHtml(store.business_name)}</h1></div>
      ${adminNav("admin")}
      ${checklist}
      ${d.is_cut_off ? `<div class="result-card" style="border-color:var(--heat)"><p>Past the ${escapeHtml(d.site_cutoff)} cutoff — your storefront is showing customers the closed page.</p></div>` : ""}
      ${!d.payment_connected ? `<div class="result-card"><p>Customers can browse and order, but can't pay until you <a href="#/admin/payment-settings">connect a payment method</a> — PayPal, e-Transfer, or Helcim.</p></div>` : ""}
      ${d.near_cap ? `<div class="result-card" style="border-color:var(--heat)"><p><strong>${escapeHtml(d.plan.label)} plan:</strong> ${money(d.used_cents)} of ${d.cap_cents !== null ? money(d.cap_cents) : "∞"} sold this month — close to the limit. <a href="#/admin/plan">Upgrade</a> to avoid new orders getting blocked.</p></div>`
        : (d.cap_cents !== null ? `<p class="muted">${escapeHtml(d.plan.label)} plan: ${money(d.used_cents)} of ${money(d.cap_cents)} sold this month. <a href="#/admin/plan">See plans</a>.</p>` : "")}

      <div class="stat-row">
        <div class="stat-card"><span class="stat-num">${d.product_count}</span><span class="stat-label">Products</span></div>
        <div class="stat-card"><span class="stat-num">${money(d.revenue_cents)}</span><span class="stat-label">Total revenue</span></div>
        <div class="stat-card"><span class="stat-num">${d.pending_orders}</span><span class="stat-label">Awaiting fulfillment</span></div>
      </div>

      <h2>Recent orders</h2>
      ${d.recent_orders.length ? `<table class="table"><thead><tr><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>
        ${d.recent_orders.map((o) => `<tr><td>${escapeHtml(o.customer_name || o.customer_email || "—")}</td><td class="mono">${money(o.total_cents)}</td><td><span class="badge badge-${o.paid ? o.status : "awaiting_payment"}">${o.paid ? o.status : "unpaid"}</span></td><td>${escapeHtml(o.created_at)}</td></tr>`).join("")}
      </tbody></table>` : `<p class="empty-state">No orders yet.</p>`}

      <p><a class="mono" href="${storeLink(store.subdomain)}" target="_blank">View your storefront ↗</a></p>
    </section>
  `;
});

// ---------------------------------------------------------------- admin: products

route("/admin/products", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  if (!store.setup_paid) { location.hash = "#/pay"; return; }

  async function renderList() {
    const { products } = await apiFetch("/api/products", { auth: "store" });
    qs("#productList").innerHTML = products.length ? `<table class="table"><thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Active</th><th></th></tr></thead><tbody>
      ${products.map((p) => `<tr>
        <td>${p.image_path ? `<img src="${assetUrl(p.image_path)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;">` : ""}</td>
        <td>${escapeHtml(p.name)}</td>
        <td class="mono">${money(p.price_cents)}</td>
        <td>${p.active ? "yes" : "no"}</td>
        <td><button class="btn btn-ghost small toggle-btn" data-id="${p.id}">${p.active ? "Deactivate" : "Activate"}</button></td>
      </tr>`).join("")}
    </tbody></table>` : `<p class="empty-state">Nothing listed yet.</p>`;

    qsa(".toggle-btn", qs("#productList")).forEach((btn) => {
      btn.addEventListener("click", async () => {
        await apiFetch(`/api/products/${btn.dataset.id}/toggle`, { method: "POST", auth: "store" });
        renderList();
      });
    });
  }

  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>Products</h1></div>
      ${adminNav("admin/products")}
      <form id="productForm" class="panel form-grid">
        <h2 class="panel-title">Add a product</h2>
        <label class="field span-2"><span class="field-label">Name</span><input type="text" name="name" required placeholder="e.g. Beaded bracelet"></label>
        <label class="field"><span class="field-label">Price (CAD)</span><div class="input-prefix"><span>$</span><input type="number" name="price" step="0.01" min="0.01" required placeholder="0.00"></div></label>
        <label class="field"><span class="field-label">Photo (optional)</span><input type="file" name="image" accept="image/*"></label>
        <label class="field span-2"><span class="field-label">Description</span><textarea name="description" rows="2" placeholder="Materials, sizes, anything buyers should know"></textarea></label>
        <div class="span-2"><button class="btn btn-primary" type="submit">Add product</button></div>
      </form>
      <h2>Your products</h2>
      <div id="productList"></div>
    </section>
  `;

  qs("#productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await apiFetch("/api/products", { method: "POST", auth: "store", form: new FormData(e.target) });
      e.target.reset();
      flash("Product added.");
      renderList();
    } catch (err) {
      flash(err.message, true);
    }
  });

  renderList();
});

// ---------------------------------------------------------------- admin: orders

route("/admin/orders", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  if (!store.setup_paid) { location.hash = "#/pay"; return; }

  async function renderOrders() {
    const { orders } = await apiFetch("/api/orders", { auth: "store" });
    qs("#ordersList").innerHTML = orders.length ? orders.map((o) => `
      <div class="order-card">
        <div class="order-head"><span class="mono">#${o.id}</span><span class="badge badge-${o.paid ? o.status : "awaiting_payment"}">${o.paid ? o.status : "unpaid"}</span></div>
        <p>${o.items.map((it) => `${it.qty}× ${escapeHtml(it.name)}`).join(", ")}${o.shipping_cents ? ` + ${money(o.shipping_cents)} shipping` : ""} — <span class="mono">${money(o.total_cents)}</span></p>
        ${o.paid ? `<p class="muted">${escapeHtml(o.customer_name || "")} &lt;${escapeHtml(o.customer_email || "")}&gt;</p>` : ""}
        ${o.paid && o.shipping_address ? `<p class="muted" style="white-space:pre-line">${escapeHtml(o.shipping_address)}</p>` : ""}
        ${!o.paid && o.payment_method === "etransfer" ? `<p class="mono muted">Waiting for e-transfer, ref: <strong>${escapeHtml(o.payment_ref)}</strong> for ${money(o.total_cents)}</p>
          <button class="btn btn-primary small mark-paid-btn" data-id="${o.id}">I got this e-transfer — mark paid</button>` : ""}
        ${o.tracking_number ? `<p class="mono muted">Tracking: ${escapeHtml(o.tracking_carrier || "")} ${escapeHtml(o.tracking_number)}</p>` : ""}
        ${o.paid && o.status === "paid" ? `<button class="btn btn-ghost small confirm-btn" data-id="${o.id}">Confirm order</button>` : ""}
        ${o.paid && o.status === "confirmed" ? `
          <form class="ship-form" data-id="${o.id}">
            <input type="text" name="tracking_carrier" placeholder="Carrier (optional)">
            <input type="text" name="tracking_number" placeholder="Tracking # (optional)">
            <button class="btn btn-ghost small" type="submit">Mark shipped</button>
          </form>` : ""}
      </div>
    `).join("") : `<p class="empty-state">No orders yet.</p>`;

    qsa(".confirm-btn", qs("#ordersList")).forEach((btn) => {
      btn.addEventListener("click", async () => {
        await apiFetch(`/api/orders/${btn.dataset.id}/confirm`, { method: "POST", auth: "store", json: {} });
        renderOrders();
      });
    });
    qsa(".mark-paid-btn", qs("#ordersList")).forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Marking paid…";
        try {
          await apiFetch(`/api/orders/${btn.dataset.id}/mark-paid`, { method: "POST", auth: "store" });
          flash("Order marked paid.");
          renderOrders();
        } catch (err) {
          flash(err.message, true);
          btn.disabled = false;
          btn.textContent = "I got this e-transfer — mark paid";
        }
      });
    });
    qsa(".ship-form", qs("#ordersList")).forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        await apiFetch(`/api/orders/${form.dataset.id}/confirm`, { method: "POST", auth: "store", json: Object.fromEntries(fd) });
        renderOrders();
      });
    });
  }

  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>Orders</h1></div>
      ${adminNav("admin/orders")}
      <div id="ordersList"></div>
    </section>
  `;
  renderOrders();
});

// ---------------------------------------------------------------- admin: payment settings

route("/admin/payment-settings", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  if (!store.setup_paid) { location.hash = "#/pay"; return; }
  const s = await apiFetch("/api/payment-settings", { auth: "store" });
  const em = await apiFetch("/api/email-settings", { auth: "store" });
  const welcome = new URLSearchParams(location.hash.split("?")[1] || "").get("welcome");
  const ppOn = !!s.paypal_me, etOn = !!s.etransfer_email;
  const ppFee = (cents) => Math.round(cents * 0.029) + 30;

  const helcimOn = !!s.helcim_account_id;
  const badge = (on, text) => `<span class="status-badge ${on ? "on" : ""}">${on ? "&#10003; " : ""}${text}</span>`;
  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>${welcome ? "You're in. How do you want to get paid?" : "Payments"}</h1></div>
      ${adminNav("admin/payment-settings")}
      ${welcome ? funnelSteps(4) : ""}
      <p class="lede">Customers only see the methods you turn on. The money goes straight to you, never through us.</p>

      <div class="panel">
        <div class="panel-head"><span class="panel-n">1</span><div><h2>Choose how customers pay</h2><p>Pick one or both. You can change this any time.</p></div></div>
        <div class="pay-methods">
          <div class="pay-card ${etOn ? "on" : ""}" id="etCard">
            <span class="ribbon">Recommended</span>
            <label class="pay-card-head"><input type="checkbox" id="etCheck" ${etOn ? "checked" : ""}> <strong>Interac e-Transfer</strong></label>
            <div class="fee-box fee-box-free"><strong>$0 in fees from us.</strong> No percentage and no per-sale charge. Receiving is free at most Canadian banks.</div>
            <div class="pay-fields" id="etFields" ${etOn ? "" : "hidden"}>
              <label class="field"><span class="field-label">Your e-Transfer (Autodeposit) email</span><input type="email" id="etEmail" placeholder="you@example.com" value="${escapeHtml(s.etransfer_email || "")}"></label>
              <label class="field" id="discRow" hidden><span class="field-label">Discount for paying by e-Transfer</span>
                <select id="etDisc">${[0, 1, 2, 3, 5].map((n) => `<option value="${n}" ${s.etransfer_discount_pct === n ? "selected" : ""}>${n === 0 ? "No discount" : n + "% off"}</option>`).join("")}</select>
              </label>
            </div>
          </div>
          <div class="pay-card ${ppOn ? "on" : ""}" id="ppCard">
            <label class="pay-card-head"><input type="checkbox" id="ppCheck" ${ppOn ? "checked" : ""}> <strong>PayPal</strong></label>
            <div class="fee-box fee-box-cost"><strong>PayPal charges its own fees:</strong> 2.9% + $0.30 per sale. US buyers add 0.8%, other countries 1.0%. <a href="https://www.paypal.com/ca/business/paypal-business-fees" target="_blank" rel="noopener noreferrer">PayPal's fee page</a></div>
            <div class="pay-fields" id="ppFields" ${ppOn ? "" : "hidden"}>
              <label class="field"><span class="field-label">Your PayPal.me name</span><input type="text" id="ppMe" placeholder="yourshop" value="${escapeHtml(s.paypal_me || "")}"></label>
              <label class="field"><span class="field-label">Email your PayPal account uses</span><input type="email" id="ppEmail" placeholder="you@example.com" value="${escapeHtml(s.paypal_email || "")}"></label>
            </div>
          </div>
        </div>
        <div class="fee-try">
          <label>Fee on a $ <input type="number" id="tryPrice" value="25" min="1" step="0.01"> sale:</label>
          <span>PayPal <strong id="tryPP"></strong></span>
          <span>e-Transfer <strong>$0.00</strong></span>
        </div>
        <button class="btn btn-primary" id="saveMethods">Save payment methods</button>
      </div>

      <div class="panel">
        <div class="panel-head"><span class="panel-n">2</span><div><h2>Automatic confirmation ${badge(em.configured, em.configured ? "On" : "Off")}</h2><p>Optional but worth it. Paid orders flip to paid on their own, so you never mark them by hand.</p></div></div>
        ${em.configured
          ? `<div class="result-card result-good"><p>Watching <span class="mono">${escapeHtml(em.imap_user)}</span>. Last check: ${escapeHtml(em.last_checked_at || "not yet")}.${em.last_error ? ` <strong>Problem:</strong> ${escapeHtml(em.last_error)}` : ""}</p></div>`
          : ""}
        <details class="inline-details" ${em.configured ? "" : "open"}>
          <summary>${em.configured ? "Change settings" : "Set it up"}</summary>
          <form id="emailForm">
            <label class="field"><span class="field-label">Mail server</span><input type="text" name="imap_host" value="${escapeHtml(em.imap_host || "imap.gmail.com")}" required></label>
            <label class="field"><span class="field-label">The inbox your bank / PayPal emails go to</span><input type="email" name="imap_user" value="${escapeHtml(em.imap_user || s.etransfer_email || s.paypal_email || "")}" required></label>
            <label class="field"><span class="field-label">App password</span><div class="pw-row"><input type="password" name="imap_password" id="imapPw" required autocomplete="off"><button type="button" class="pw-toggle" id="imapPwToggle">Show</button></div></label>
            <div class="btn-row"><button class="btn btn-primary" type="submit">${em.configured ? "Update" : "Turn on"}</button>
            ${em.configured ? `<button class="btn btn-ghost" type="button" id="emailOff">Turn off</button>` : ""}</div>
          </form>
          <p class="hint"><strong>Use a Gmail made just for payments.</strong> An email only counts if it's from a real bank or PayPal, passes its signature check, is addressed to you, and matches an order's exact amount.</p>
        </details>
        <details class="inline-details">
          <summary>Step-by-step guide</summary>
          <ol class="guide-steps">
            <li><strong>Make a dedicated Gmail.</strong> A fresh Gmail used only for payment notifications keeps this limited to payments, never your real inbox.</li>
            <li><strong>Point your payments here.</strong> On PayPal, use this Gmail as your account email. For e-Transfer, register it as your bank's Autodeposit email.</li>
            <li><strong>Turn on 2-Step Verification</strong> at <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">myaccount.google.com/security</a>. App Passwords won't appear until this is on.</li>
            <li><strong>Create an App Password</strong> at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">myaccount.google.com/apppasswords</a>. Name it anything, then copy the 16-character code. Google shows it once.</li>
            <li><strong>Fill in the form above</strong> with <code>imap.gmail.com</code>, the Gmail address, and the code (spaces don't matter), then click Turn on.</li>
            <li><strong>Test it.</strong> Send yourself a small real payment, then paste the confirmation email into "Test an email" below. Gmail: open the email, menu, Show original, copy everything.</li>
          </ol>
          <p class="hint">No "App passwords" option? 2-Step Verification usually isn't fully on yet. Google Workspace admins can also disable it.</p>
        </details>
        ${testBoxHtml("emailTest")}
      </div>

      <div class="panel panel-muted">
        <div class="panel-head"><span class="panel-n">3</span><div><h2>Card and bank checkout ${badge(helcimOn, helcimOn ? "Connected" : "Optional")}</h2><p>Instant checkout with Helcim. Needs your own Helcim merchant account (18+).</p></div></div>
        <details class="inline-details" ${helcimOn ? "" : ""}>
          <summary>${helcimOn ? "Update Helcim" : "Connect Helcim"}</summary>
          ${helcimOn ? `<div class="result-card result-good"><p>Connected: account <span class="mono">${escapeHtml(s.helcim_account_id)}</span>. Buyers can pay by card or bank and the order confirms instantly.</p></div>` : ""}
          <form id="helcimForm">
            <label class="field"><span class="field-label">Helcim Account ID</span><input type="text" name="helcim_account_id" value="${escapeHtml(s.helcim_account_id || "")}" required></label>
            <label class="field"><span class="field-label">Helcim API Token</span><div class="pw-row"><input type="password" name="helcim_api_token" id="helcimTokenInput" required><button type="button" class="pw-toggle" id="helcimTokenToggle">Show</button></div></label>
            ${helcimOn ? `<p class="hint">Re-enter your token to update anything here. It's never shown back to you.</p>` : ""}
            <button class="btn btn-primary" type="submit">${helcimOn ? "Update" : "Connect Helcim"}</button>
          </form>
          <p class="hint">Find these in your Helcim dashboard under Settings, Integrations, API Access. Money goes directly to you, never through us.</p>
        </details>
      </div>
      ${welcome ? `<a class="btn btn-primary btn-lg full" href="#/admin">Go to my dashboard</a>` : ""}
    </section>`;

  const show = (id, on) => (qs(id).hidden = !on);
  const refresh = () => {
    const pp = qs("#ppCheck").checked, et = qs("#etCheck").checked;
    show("#ppFields", pp); show("#etFields", et); show("#discRow", pp && et);
    qs("#ppCard").classList.toggle("on", pp); qs("#etCard").classList.toggle("on", et);
    const price = Math.round((parseFloat(qs("#tryPrice").value) || 0) * 100);
    qs("#tryPP").textContent = money(ppFee(price));
  };
  ["#ppCheck", "#etCheck", "#tryPrice"].forEach((id) => qs(id).addEventListener("input", refresh));
  refresh();

  qs("#saveMethods").addEventListener("click", async () => {
    try {
      await apiFetch("/api/payment-settings", { method: "POST", auth: "store", json: {
        enable_paypal: qs("#ppCheck").checked, paypal_me: qs("#ppMe").value, paypal_email: qs("#ppEmail").value,
        enable_etransfer: qs("#etCheck").checked, etransfer_email: qs("#etEmail").value,
        etransfer_discount_pct: (qs("#ppCheck").checked && qs("#etCheck").checked) ? parseInt(qs("#etDisc").value, 10) : 0,
      } });
      flash("Saved."); renderRoute();
    } catch (err) { flash(err.message, true); }
  });
  qs("#helcimTokenToggle").addEventListener("click", (e) => {
    const i = qs("#helcimTokenInput"); i.type = i.type === "password" ? "text" : "password"; e.target.textContent = i.type === "password" ? "Show" : "Hide";
  });
  qs("#helcimForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Connecting…";
    try {
      await apiFetch("/api/payment-settings", { method: "POST", auth: "store", json: Object.fromEntries(new FormData(e.target)) });
      flash("Helcim connected. Instant card/bank checkout is live.");
      renderRoute();
    } catch (err) {
      flash(err.message, true);
      btn.disabled = false; btn.textContent = s.helcim_account_id ? "Update" : "Connect Helcim";
    }
  });
  wireTestBox("emailTest", "/api/email-settings/test", "store");
  qs("#imapPwToggle").addEventListener("click", (e) => {
    const i = qs("#imapPw"); i.type = i.type === "password" ? "text" : "password"; e.target.textContent = i.type === "password" ? "Show" : "Hide";
  });
  qs("#emailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Testing login…";
    try {
      await apiFetch("/api/email-settings", { method: "POST", auth: "store", json: Object.fromEntries(new FormData(e.target)) });
      flash("Automatic confirmation is on."); renderRoute();
    } catch (err) { flash(err.message, true); btn.disabled = false; btn.textContent = "Turn on"; }
  });
  const off = qs("#emailOff");
  if (off) off.addEventListener("click", async () => {
    await apiFetch("/api/email-settings", { method: "DELETE", auth: "store" }); flash("Turned off."); renderRoute();
  });
});

// ---------------------------------------------------------------- admin: customize

route("/admin/customize", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  if (!store.setup_paid) { location.hash = "#/pay"; return; }
  const meta = await getMeta();

  const currentFont = store.font_choice || "signature";
  const currentLayout = store.layout_style || "grid";
  const currentAccent = store.accent_style || "rounded";
  const currentBanner = store.banner_style || "image";
  const currentCard = store.card_style || "shadow";
  const currentLook = store.page_look || "dark";
  const currentBtn = store.button_style || "solid";

  function themeCardHtml(t) {
    const f = meta.font_pairings[t.font_choice];
    const look = lookFor(meta, t.page_look);
    const r = t.accent_style === "sharp" ? "2px" : "8px";
    const bannerBg = t.banner_style === "solid" ? t.theme_color : `linear-gradient(135deg, ${t.theme_color}, ${shadeHex(t.theme_color, -35)})`;
    const btnR = t.button_style === "pill" ? "99px" : t.button_style === "block" ? "0" : r;
    const btnCss = t.button_style === "outline" ? `border:1.5px solid ${t.theme_color}; color:${t.theme_color}` : `background:${t.theme_color}; color:${onAccentColor(t.theme_color)}`;
    return `<span class="theme-mini" style="background:${look.bg}; border-color:${look.border}; border-radius:${r}">
      <span class="theme-mini-banner" style="background:${bannerBg}"></span>
      <span class="theme-mini-name" style="font-family:${f.heading}; color:${look.text}">${escapeHtml(t.name)}</span>
      <span class="theme-mini-cards"><i style="background:${look.surface2}; border-radius:${r}"></i><i style="background:${look.surface2}; border-radius:${r}"></i></span>
      <span class="theme-mini-btn" style="${btnCss}; border-radius:${btnR}"></span>
    </span>`;
  }

  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>Customize</h1></div>
      ${adminNav("admin/customize")}

      <span class="field-label">Start from a theme</span>
      <p class="hint" style="margin-top:-.3rem">One click sets the color, page look, font, layout, buttons and banner together — tweak anything below afterward.</p>
      <div class="theme-gallery">
        ${meta.themes.map((t) => `<button type="button" class="theme-card" data-theme='${JSON.stringify(t).replace(/'/g, "&#39;")}'>
          ${themeCardHtml(t)}
          <span class="theme-card-name">${escapeHtml(t.name)}</span>
          <span class="theme-card-blurb">${escapeHtml(t.blurb || "")}</span>
        </button>`).join("")}
      </div>

      <div class="customize-layout">
        <form id="customizeForm">
          <span class="field-label">Accent color</span>
          <div class="swatch-row">
            ${meta.theme_presets.map((t) => `<label class="swatch" style="--swatch-color: ${t.hex}">
              <input type="radio" name="theme_color" value="${t.hex}" data-preview-color ${store.theme_color === t.hex ? "checked" : ""}>
              <span class="swatch-dot"></span><span class="swatch-name">${escapeHtml(t.name)}</span>
            </label>`).join("")}
          </div>
          <label class="field custom-color-field">
            <span class="field-label">...or pick any color</span>
            <div class="color-pick-row">
              <input type="color" id="customColorPicker" value="${store.theme_color || "#E31C3D"}">
              <input type="text" name="custom_color" id="customColorHex" class="mono" placeholder="#RRGGBB" maxlength="7" data-preview-color>
            </div>
          </label>

          <label class="field"><span class="field-label">Logo (square mark)</span><input type="file" name="logo" accept="image/*"></label>
          ${store.logo_image ? `<img class="logo-preview" src="${assetUrl(store.logo_image)}">` : ""}
          <label class="field"><span class="field-label">Banner photo</span><input type="file" name="banner" accept="image/*"></label>
          ${store.banner_image ? `<img class="banner-preview" src="${assetUrl(store.banner_image)}" style="max-width:100%;border-radius:8px;">` : ""}

          <span class="field-label">Banner style</span>
          <div class="chip-row">
            ${meta.banner_styles.map((s) => `<label class="chip-radio"><input type="radio" name="banner_style" value="${s.key}" data-preview-banner ${currentBanner === s.key ? "checked" : ""}> ${escapeHtml(s.label)}</label>`).join("")}
          </div>
          <p class="hint" style="margin-top:-.4rem">"Photo" falls back to a gradient automatically on any page where you haven't uploaded a banner yet.</p>

          <label class="field"><span class="field-label">Tagline</span><input type="text" name="tagline" id="taglineInput" maxlength="120" value="${escapeHtml(store.tagline || "")}"></label>
          <label class="field"><span class="field-label">About your shop</span><textarea name="about_text" id="aboutInput" rows="3" maxlength="600">${escapeHtml(store.about_text || "")}</textarea></label>

          <span class="field-label">Typeface</span>
          <div class="chip-row">
            ${Object.entries(meta.font_pairings).map(([key, f]) => `<label class="chip-radio"><input type="radio" name="font_choice" value="${key}" data-preview-font ${currentFont === key ? "checked" : ""}> ${escapeHtml(f.label)}</label>`).join("")}
          </div>
          <span class="field-label">Product layout</span>
          <div class="chip-row">
            ${meta.layout_styles.map((s) => `<label class="chip-radio"><input type="radio" name="layout_style" value="${s.key}" ${currentLayout === s.key ? "checked" : ""}> ${escapeHtml(s.label)}</label>`).join("")}
          </div>
          <span class="field-label">Corner style</span>
          <div class="chip-row">
            ${meta.accent_styles.map((s) => `<label class="chip-radio"><input type="radio" name="accent_style" value="${s.key}" ${currentAccent === s.key ? "checked" : ""}> ${escapeHtml(s.label)}</label>`).join("")}
          </div>
          <span class="field-label">Header alignment</span>
          <div class="chip-row">
            <label class="chip-radio"><input type="radio" name="hero_align" value="left" ${(store.hero_align || "left") === "left" ? "checked" : ""}> Left</label>
            <label class="chip-radio"><input type="radio" name="hero_align" value="center" ${store.hero_align === "center" ? "checked" : ""}> Centered</label>
          </div>
          <span class="field-label">Products per row (grid layout)</span>
          <div class="chip-row">
            ${[2, 3, 4].map((n) => `<label class="chip-radio"><input type="radio" name="grid_columns" value="${n}" ${(store.grid_columns || 2) === n ? "checked" : ""}> ${n}</label>`).join("")}
          </div>
          <label class="field"><span class="field-label">Announcement bar (sale, shipping cutoff, news)</span><input type="text" name="announcement" id="announceInput" maxlength="140" value="${escapeHtml(store.announcement || "")}" placeholder="e.g. Free local pickup this weekend"></label>
          <label class="field"><span class="field-label">Order button text</span><input type="text" name="order_button_text" id="orderBtnInput" maxlength="24" value="${escapeHtml(store.order_button_text || "")}" placeholder="Order"></label>
          <label class="field"><span class="field-label">Footer note (returns, hours, contact)</span><textarea name="footer_note" id="footerInput" rows="2" maxlength="300">${escapeHtml(store.footer_note || "")}</textarea></label>
          <span class="field-label">Page look</span>
          <div class="chip-row">
            ${meta.page_looks.map((s) => `<label class="chip-radio"><input type="radio" name="page_look" value="${s.key}" ${currentLook === s.key ? "checked" : ""}> ${escapeHtml(s.label)}</label>`).join("")}
          </div>
          <span class="field-label">Button style</span>
          <div class="chip-row">
            ${meta.button_styles.map((s) => `<label class="chip-radio"><input type="radio" name="button_style" value="${s.key}" ${currentBtn === s.key ? "checked" : ""}> ${escapeHtml(s.label)}</label>`).join("")}
          </div>
          <span class="field-label">Product card style</span>
          <div class="chip-row">
            ${meta.card_styles.map((s) => `<label class="chip-radio"><input type="radio" name="card_style" value="${s.key}" ${currentCard === s.key ? "checked" : ""}> ${escapeHtml(s.label)}</label>`).join("")}
          </div>

          ${store.is_physical ? `
          <span class="field-label">Shipping</span>
          <div class="chip-row">
            ${meta.ship_to_options.map((o) => `<label class="chip-radio"><input type="radio" name="ships_to" value="${o.key}" ${(store.ships_to || "ca") === o.key ? "checked" : ""}> ${escapeHtml(o.label)}</label>`).join("")}
          </div>
          <label class="field"><span class="field-label">Flat shipping rate — leave at $0.00 for free shipping</span><input type="number" name="shipping_flat_dollars" step="0.01" min="0" value="${((store.shipping_flat_cents || 0) / 100).toFixed(2)}"></label>
          ` : ""}

          <label class="field"><span class="field-label">Instagram (optional)</span><input type="text" name="social_instagram" value="${escapeHtml(store.social_instagram || "")}"></label>
          <label class="field"><span class="field-label">Website (optional)</span><input type="text" name="social_website" value="${escapeHtml(store.social_website || "")}"></label>

          <button class="btn btn-primary full" type="submit">Save</button>
        </form>
        <aside class="preview-pane">
          <span class="field-label">Live preview</span>
          <div class="preview-frame" id="previewFrame" data-btn="${currentBtn}" style="--accent: ${store.theme_color || "#E31C3D"}; --on-accent: ${onAccentColor(store.theme_color || "#E31C3D")}; --pv-radius: ${currentAccent === "sharp" ? "4px" : "14px"};">
            <div class="pv-announce" id="pvAnnounce" ${store.announcement ? "" : "hidden"}>${escapeHtml(store.announcement || "")}</div>
            <div class="pv-banner ${(currentBanner === "image" && store.banner_image) ? "" : "pv-banner-generated"}" id="pvBanner" style="${(currentBanner === "image" && store.banner_image) ? `background-image:url('${assetUrl(store.banner_image)}')` : `background:${currentBanner === "solid" ? (store.theme_color || "#E31C3D") : `linear-gradient(135deg, ${store.theme_color || "#E31C3D"}, ${shadeHex(store.theme_color || "#E31C3D", -35)})`}`}"></div>
            <div class="pv-body">
              <div class="pv-title-row ${store.hero_align === "center" ? "pv-center" : ""}" id="pvTitleRow">
                ${store.logo_image ? `<img class="pv-logo" id="pvLogo" src="${assetUrl(store.logo_image)}">` : `<div class="pv-logo pv-logo-empty" id="pvLogo"></div>`}
                <div><div class="pv-name" id="pvName" style="font-family:${meta.font_pairings[currentFont].heading}">${escapeHtml(store.business_name)}</div><div class="pv-tagline" id="pvTagline">${escapeHtml(store.tagline || "Your tagline here")}</div></div>
              </div>
              <p class="pv-about" id="pvAbout">${escapeHtml(store.about_text || "A line or two about your shop shows up here.")}</p>
              <div class="pv-products pv-products-${currentLayout}" id="pvProducts" style="--cols:${store.grid_columns || 2}">
                <div class="pv-product pv-product-${currentCard}"><div class="pv-product-img"></div><div class="pv-product-name">Sample item</div><div class="pv-product-price">$24.00</div></div>
                <div class="pv-product pv-product-${currentCard}"><div class="pv-product-img"></div><div class="pv-product-name">Another item</div><div class="pv-product-price">$18.00</div></div>
              </div>
              <div class="pv-btn" id="pvBtn">${escapeHtml(store.order_button_text || "Order")}</div>
              <p class="pv-foot" id="pvFoot" ${store.footer_note ? "" : "hidden"}>${escapeHtml(store.footer_note || "")}</p>
            </div>
          </div>
          <p class="hint">Updates instantly as you pick — nothing here is saved until you click Save.</p>
        </aside>
      </div>
      <a class="mono" href="${storeLink(store.subdomain)}" target="_blank">View your storefront ↗</a>
    </section>
  `;

  // live preview wiring
  const frame = qs("#previewFrame");
  const pvBanner = qs("#pvBanner");
  function currentAccentHex() {
    const checked = qs('input[name="theme_color"]:checked');
    return checked ? checked.value : qs("#customColorHex").value || "#E31C3D";
  }
  function refreshBanner() {
    const style = qs('input[name="banner_style"]:checked').value;
    const accent = currentAccentHex();
    const hasPhoto = pvBanner.dataset.hasPhoto === "1";
    if (style === "image" && hasPhoto) {
      pvBanner.classList.remove("pv-banner-generated");
      pvBanner.style.background = `url('${pvBanner.dataset.photoUrl}') center/cover`;
    } else {
      pvBanner.classList.add("pv-banner-generated");
      pvBanner.style.background = style === "solid" ? accent : `linear-gradient(135deg, ${accent}, ${shadeHex(accent, -35)})`;
    }
  }
  pvBanner.dataset.hasPhoto = store.banner_image ? "1" : "0";
  pvBanner.dataset.photoUrl = store.banner_image ? `${assetUrl(store.banner_image)}` : "";

  function setAccent(hex) { if (/^#[0-9A-Fa-f]{6}$/.test(hex)) { frame.style.setProperty("--accent", hex); frame.style.setProperty("--on-accent", onAccentColor(hex)); refreshBanner(); } }
  function applyLookToFrame(key) {
    const l = lookFor(meta, key);
    frame.style.setProperty("--surface", l.bg); frame.style.setProperty("--surface-2", l.surface2);
    frame.style.setProperty("--text", l.text); frame.style.setProperty("--muted", l.muted); frame.style.setProperty("--border", l.border);
  }
  applyLookToFrame(currentLook);
  qsa('input[name="page_look"]').forEach((el) => el.addEventListener("change", function () { applyLookToFrame(this.value); }));
  qsa('input[name="button_style"]').forEach((el) => el.addEventListener("change", function () { frame.dataset.btn = this.value; }));
  qsa("[data-preview-color]").forEach((el) => {
    el.addEventListener("input", function () { if (this.value) setAccent(this.value); });
    el.addEventListener("change", function () { if (this.value) setAccent(this.value); });
  });
  qs("#customColorPicker").addEventListener("input", function () {
    qs("#customColorHex").value = this.value;
    setAccent(this.value);
    qsa('input[name="theme_color"]').forEach((r) => (r.checked = false));
  });
  qs("#taglineInput").addEventListener("input", function () { qs("#pvTagline").textContent = this.value || "Your tagline here"; });
  qs("#aboutInput").addEventListener("input", function () { qs("#pvAbout").textContent = this.value || "A line or two about your shop shows up here."; });
  function bindText(inputSel, fn) { const el = qs(inputSel); el.addEventListener("input", () => fn(el.value)); }
  bindText("#announceInput", (v) => { const a = qs("#pvAnnounce"); a.textContent = v; a.hidden = !v; });
  bindText("#orderBtnInput", (v) => { qs("#pvBtn").textContent = v || "Order"; });
  bindText("#footerInput", (v) => { const f = qs("#pvFoot"); f.textContent = v; f.hidden = !v; });
  qsa('input[name="hero_align"]').forEach((el) => el.addEventListener("change", function () { qs("#pvTitleRow").classList.toggle("pv-center", this.value === "center"); }));
  qsa('input[name="grid_columns"]').forEach((el) => el.addEventListener("change", function () { qs("#pvProducts").style.setProperty("--cols", this.value); }));
  qsa('input[name="layout_style"]').forEach((el) => el.addEventListener("change", function () { qs("#pvProducts").className = "pv-products pv-products-" + this.value; }));
  qsa('input[name="accent_style"]').forEach((el) => el.addEventListener("change", function () { frame.style.setProperty("--pv-radius", this.value === "sharp" ? "4px" : "14px"); }));
  qsa('input[name="card_style"]').forEach((el) => el.addEventListener("change", function () {
    qsa(".pv-product").forEach((p) => { p.className = "pv-product pv-product-" + this.value; });
  }));
  qsa('input[name="banner_style"]').forEach((el) => el.addEventListener("change", refreshBanner));
  qsa('input[name="font_choice"]').forEach((el) => el.addEventListener("change", function () {
    qs("#pvName").style.fontFamily = meta.font_pairings[this.value].heading;
  }));
  qs('input[name="banner"]').addEventListener("change", function () {
    if (this.files && this.files[0]) {
      pvBanner.dataset.hasPhoto = "1";
      pvBanner.dataset.photoUrl = URL.createObjectURL(this.files[0]);
      refreshBanner();
    }
  });

  qsa(".theme-card").forEach((card) => {
    card.addEventListener("click", () => {
      const t = JSON.parse(card.dataset.theme);
      qsa(".theme-card").forEach((c) => c.classList.remove("on"));
      card.classList.add("on");
      // Drive every field through its own change/input handlers above, rather
      // than touching the preview directly here, so a theme click and a manual
      // tweak afterward both go through the exact same update path.
      qsa('input[name="theme_color"]').forEach((r) => { r.checked = r.value === t.theme_color; });
      qs("#customColorHex").value = ""; qs("#customColorPicker").value = t.theme_color;
      setAccent(t.theme_color);
      ["font_choice", "layout_style", "accent_style", "banner_style", "card_style", "page_look", "button_style"].forEach((field) => {
        const radio = qs(`input[name="${field}"][value="${t[field]}"]`);
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event("change", { bubbles: true })); }
      });
      flash(`${t.name} applied — fine-tune anything below, then Save.`);
    });
  });

  qs("#customizeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await apiFetch("/api/customize", { method: "POST", auth: "store", form: new FormData(e.target) });
      flash("Storefront updated.");
      renderRoute(); // re-render this same page with fresh data (no navigation)
    } catch (err) {
      flash(err.message, true);
    }
  });
});

// ---------------------------------------------------------------- admin: plan / revenue cap

route("/admin/plan", async (params, app) => {
  const store = await requireStoreAuth();
  if (!store) return;
  if (!store.setup_paid) { location.hash = "#/pay"; return; }
  const meta = await getMeta();
  const p = await apiFetch("/api/plan", { auth: "store" });
  const planIcons = { starter: "❄️", growth: "🌡️", scale: "🔥" };

  let invoiceHtml = "";
  if (p.open_invoice) {
    invoiceHtml = `<div class="result-card ${p.open_invoice.overdue ? "" : ""}" style="${p.open_invoice.overdue ? "border-color:var(--heat)" : ""}">
      <p>${p.open_invoice.overdue ? "<strong>Overdue —</strong>" : `<strong>Due ${escapeHtml(p.open_invoice.period_end.slice(0, 10))} + ${p.grace_days} days grace —</strong>`}
      your Scale invoice for ${escapeHtml(p.open_invoice.period_start.slice(0, 7))} is <strong>${money(p.open_invoice.amount_cents)}</strong> (1% of that month's sales, $49 minimum).
      ${p.open_invoice.overdue ? "Your store is currently capped like Starter until this is paid." : ""}</p>
      <button class="btn btn-primary" id="payInvoiceBtn">Pay ${money(p.open_invoice.amount_cents)} now</button>
    </div>`;
  }

  const pct = p.cap_cents ? Math.min(100, (p.used_cents / p.cap_cents) * 100) : 0;

  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>Plan</h1></div>
      ${adminNav("admin/plan")}
      <div class="stat-row">
        <div class="stat-card"><span class="stat-num">${escapeHtml(p.current_plan.label)}</span><span class="stat-label">Current plan</span></div>
        <div class="stat-card"><span class="stat-num">${money(p.used_cents)}</span><span class="stat-label">Sold this month</span></div>
        <div class="stat-card"><span class="stat-num">${p.cap_cents !== null ? money(p.cap_cents) : "None"}</span><span class="stat-label">Monthly cap</span></div>
      </div>
      ${p.cap_cents !== null
        ? `<div class="plan-meter"><div class="plan-meter-fill" style="width:${pct}%"></div></div>
           <p class="hint ${pct >= 90 ? "hint-error" : ""}">${money(p.used_cents)} of ${money(p.cap_cents)} used this month (${pct.toFixed(0)}%). ${pct >= 90 ? "You're close to the limit — new orders will be blocked once you hit it." : ""}</p>`
        : `<p class="hint hint-good">Unlimited this month — no sales cap while ${escapeHtml(p.current_plan.label)} is in good standing.</p>`}
      ${p.current_plan.key === "growth" && p.renews_at ? `<p class="muted">Renews ${escapeHtml(p.renews_at.slice(0, 10))} — pay again any time before then to keep Growth active without a gap.</p>
        ${p.accrued_credit_cents ? `<p class="hint hint-good">You've built up <strong>${money(p.accrued_credit_cents)}</strong> in Helcim-fee credit this period — that comes off your next renewal automatically.</p>` : ""}` : ""}
      ${invoiceHtml}

      <h2>Plans</h2>
      <p class="muted">Cool and free to start. Turn up the heat as you grow — no ceiling on how far it goes.</p>
      <div class="plan-grid">
        ${meta.plan_order.map((key) => {
          const plan = meta.plans[key];
          const isCurrent = key === p.current_plan.key;
          const priceHtml = plan.kind === "usage" ? '1%<span class="muted">/sale</span>' : (plan.price_dollars ? `$${plan.price_dollars.toFixed(0)}<span class="muted">/mo</span>` : "Free");
          let actionHtml;
          if (isCurrent) actionHtml = `<span class="badge badge-shipped">Current plan</span>`;
          else if (key === "starter") actionHtml = `<span class="muted">Automatic once a paid plan lapses.</span>`;
          else actionHtml = `<a class="btn btn-primary full" href="#/admin/plan/upgrade/${key}">${meta.plan_order.indexOf(key) > meta.plan_order.indexOf(p.current_plan.key) ? "Upgrade" : "Switch"} to ${escapeHtml(plan.label)}</a>`;
          return `<div class="plan-card plan-card-${key} ${isCurrent ? "plan-card-current" : ""}">
            <div class="plan-card-icon">${planIcons[key] || ""}</div>
            <h3>${escapeHtml(plan.label)}</h3>
            <p class="plan-price">${priceHtml}</p>
            <p class="muted">${escapeHtml(plan.tagline)}</p>
            ${actionHtml}
          </div>`;
        }).join("")}
      </div>
      <p class="hint">Growth is a one-time, 30-day pass — no card kept on file, renew any time before it lapses. Scale bills monthly based on what you actually sold, paid the same way.</p>
    </section>
  `;

  if (p.open_invoice) {
    qs("#payInvoiceBtn").addEventListener("click", () => { location.hash = "#/admin/plan/invoice"; });
  }
});

// ============================================================================
// VIEWS: owner portal
// ============================================================================

async function requireOwnerAuth() {
  if (!Auth.getOwnerToken()) { location.hash = "#/owner/login"; return false; }
  try {
    await apiFetch("/api/owner/overview", { auth: "owner" }); // cheapest way to validate the token is still good
    return true;
  } catch (err) {
    location.hash = "#/owner/login";
    return false;
  }
}

function ownerNav(active) {
  return `<nav class="admin-tabs">
    <a class="${active === "overview" ? "active" : ""}" href="#/owner">Overview</a>
    <a class="${active === "security" ? "active" : ""}" href="#/owner/security">Security</a>
    <a class="${active === "fees" ? "active" : ""}" href="#/owner/fees">Fees &amp; payments</a>
    <a href="#" id="exportOrdersLink">Export orders CSV</a>
    <a href="#" id="exportStoresLink">Export stores CSV</a>
    <a href="#/owner/logout">Log out</a>
  </nav>`;
}

async function downloadCsv(path, filename) {
  const res = await apiFetch(path, { auth: "owner" });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function wireOwnerNavExports() {
  const o = qs("#exportOrdersLink"), s = qs("#exportStoresLink");
  if (o) o.addEventListener("click", (e) => { e.preventDefault(); downloadCsv("/api/owner/export/orders.csv", "orders.csv"); });
  if (s) s.addEventListener("click", (e) => { e.preventDefault(); downloadCsv("/api/owner/export/stores.csv", "stores.csv"); });
}

route("/owner/login", async (params, app) => {
  app.innerHTML = `
    <section class="funnel-step owner-login-step">
      <div class="owner-login-mark">P</div>
      <h1>Owner portal</h1>
      <p class="lede">Password only — this is the one account.</p>
      <form id="ownerLoginForm">
        <label class="field"><span class="field-label">Password</span>
          <div class="pw-row"><input type="password" name="password" id="ownerPw" required autofocus autocomplete="current-password"><button type="button" class="pw-toggle" id="ownerPwToggle">Show</button></div>
        </label>
        <button class="btn btn-primary full" type="submit">Log in</button>
      </form>
    </section>
  `;
  qs("#ownerPwToggle").addEventListener("click", (e) => {
    const i = qs("#ownerPw"); i.type = i.type === "password" ? "text" : "password"; e.target.textContent = i.type === "password" ? "Show" : "Hide";
  });
  qs("#ownerLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Logging in…";
    try {
      const data = await apiFetch("/api/auth/owner/login", { method: "POST", json: { password: fd.get("password") } });
      if (data.need_code) {
        renderOwner2faForm(app, data.pending_token);
      } else {
        Auth.setOwnerToken(data.token);
        location.hash = "#/owner";
      }
    } catch (err) {
      flash(err.message, true);
      btn.disabled = false; btn.textContent = "Log in";
    }
  });
});

function renderOwner2faForm(app, pendingToken) {
  app.innerHTML = `
    <section class="funnel-step">
      <h1>Owner portal.</h1>
      <p class="lede">Password checked out. Enter the 6-digit code from your authenticator app.</p>
      <form id="owner2faForm">
        <label class="field"><span class="field-label">Authenticator code</span>
          <input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus>
        </label>
        <button class="btn btn-primary full" type="submit">Verify</button>
      </form>
    </section>
  `;
  qs("#owner2faForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await apiFetch("/api/auth/owner/2fa", { method: "POST", json: { pending_token: pendingToken, code: fd.get("code") } });
      Auth.setOwnerToken(data.token);
      location.hash = "#/owner";
    } catch (err) {
      flash(err.message, true);
    }
  });
}

route("/owner/logout", async () => {
  try { await apiFetch("/api/owner/logout", { method: "POST", auth: "owner" }); } catch (e) {}
  Auth.setOwnerToken(null);
  location.hash = "#/";
});

route("/owner", async (params, app) => {
  if (!(await requireOwnerAuth())) return;
  const hashQuery = new URLSearchParams((location.hash.split("?")[1] || ""));
  const storeFilter = hashQuery.get("store") || "";
  const statusFilter = hashQuery.get("status") || "";
  const page = parseInt(hashQuery.get("page") || "1", 10);
  const qp = new URLSearchParams({ store: storeFilter, status: statusFilter, page });
  const d = await apiFetch(`/api/owner/overview?${qp.toString()}`, { auth: "owner" });

  app.innerHTML = `
    <section class="admin admin-wide">
      <div class="admin-header"><h1>Everything, at a glance</h1></div>
      ${ownerNav("overview")}
      ${d.is_cut_off ? `<div class="result-card" style="border-color:var(--heat)"><p>Past the site cutoff — public storefronts are showing customers the closed page.</p></div>` : ""}

      <div class="stat-row stat-row-5">
        <div class="stat-card"><span class="stat-num">${d.stores.length}</span><span class="stat-label">Stores created</span></div>
        <div class="stat-card"><span class="stat-num">${money(d.setup_revenue_cents)}</span><span class="stat-label">Setup fee revenue</span></div>
        <div class="stat-card"><span class="stat-num">${money(d.plan_revenue_cents)}</span><span class="stat-label">Plan revenue (your cut)</span></div>
        <div class="stat-card"><span class="stat-num">${money(d.total_order_volume_cents)}</span><span class="stat-label">Order volume (all sellers, not yours)</span></div>
        <div class="stat-card"><span class="stat-num">${money(d.avg_order_cents)}</span><span class="stat-label">Avg. order value</span></div>
      </div>
      <p class="muted">Plan mix: ${Object.entries(d.plan_counts).map(([k, v]) => `${escapeHtml(k)}: ${v}`).join(", ")}</p>

      ${d.chart_svg ? `<h2>Platform revenue — last 14 days</h2><div class="chart-card">${d.chart_svg}</div>` : ""}

      <h2>Top sellers</h2>
      ${d.top_sellers.some((s) => s.revenue_cents) ? `<table class="table"><thead><tr><th>#</th><th>Store</th><th>Owner</th><th>Revenue</th><th>Paid orders</th></tr></thead><tbody>
        ${d.top_sellers.filter((s) => s.revenue_cents).map((s, i) => `<tr>
          <td class="mono">${i + 1}</td>
          <td><a href="#/owner/store/${s.id}">${escapeHtml(s.business_name || s.subdomain)}</a></td>
          <td class="muted">${escapeHtml(s.owner_email)}</td>
          <td class="mono">${money(s.revenue_cents)}</td>
          <td>${s.paid_orders}</td>
        </tr>`).join("")}
      </tbody></table>` : `<p class="empty-state">No paid orders yet — top sellers will rank here once money starts moving.</p>`}

      <h2>Stores</h2>
      <table class="table"><thead><tr><th>Store</th><th>Owner</th><th>Type</th><th>Plan</th><th>Setup paid</th><th>Status</th><th>Created</th></tr></thead><tbody>
        ${d.stores.map((s) => `<tr>
          <td><a href="#/owner/store/${s.id}">${escapeHtml(s.subdomain)}.${escapeHtml(d.root_domain)}</a></td>
          <td>${escapeHtml(s.owner_email)}</td>
          <td>${s.is_physical ? "Ships" : "No shipping"}</td>
          <td><span class="badge ${s.plan_effective === "comp" ? "badge-comp" : (s.plan_effective !== "starter" ? "badge-shipped" : "")}">${escapeHtml(s.plan_effective)}</span></td>
          <td><span class="badge ${s.setup_paid ? "badge-shipped" : "badge-awaiting_payment"}">${s.setup_paid ? "yes" : "no"}</span></td>
          <td>${s.suspended ? `<span class="badge" style="color:var(--heat);border-color:var(--heat)">Suspended</span>` : `<span class="badge badge-shipped">Active</span>`}</td>
          <td>${escapeHtml(s.created_at)}</td>
        </tr>`).join("")}
      </tbody></table>

      <h2>Purchases across every store</h2>
      <form id="ownerFilterForm" class="filter-row">
        <select name="store">
          <option value="">All stores</option>
          ${d.stores.map((s) => `<option value="${escapeHtml(s.subdomain)}" ${storeFilter === s.subdomain ? "selected" : ""}>${escapeHtml(s.subdomain)}</option>`).join("")}
        </select>
        <select name="status">
          <option value="">Any status</option>
          <option value="unpaid" ${statusFilter === "unpaid" ? "selected" : ""}>Unpaid</option>
          <option value="paid" ${statusFilter === "paid" ? "selected" : ""}>Paid</option>
          <option value="confirmed" ${statusFilter === "confirmed" ? "selected" : ""}>Confirmed</option>
          <option value="shipped" ${statusFilter === "shipped" ? "selected" : ""}>Shipped</option>
        </select>
        <button class="btn btn-ghost small" type="submit">Filter</button>
      </form>

      ${d.orders.length ? `<table class="table"><thead><tr><th>Store</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>
        ${d.orders.map((o) => `<tr>
          <td class="mono">${escapeHtml(o.subdomain)}</td>
          <td>${escapeHtml(o.customer_name || o.customer_email || "")}</td>
          <td>${money(o.total_cents)}</td>
          <td><span class="badge badge-${o.paid ? o.status : "awaiting_payment"}">${o.paid ? o.status : "unpaid"}</span></td>
          <td>${escapeHtml(o.created_at)}</td>
        </tr>`).join("")}
      </tbody></table>
      ${d.filters.total_pages > 1 ? `<div class="pager">${Array.from({ length: d.filters.total_pages }, (_, i) => i + 1).map((pnum) => `<a class="${pnum === d.filters.page ? "active" : ""}" href="#/owner?store=${encodeURIComponent(storeFilter)}&status=${encodeURIComponent(statusFilter)}&page=${pnum}">${pnum}</a>`).join("")}</div>` : ""}
      ` : `<p class="empty-state">No purchases match that filter.</p>`}

      <h2>Support messages</h2>
      ${d.support_messages.length ? d.support_messages.map((m) => `
        <div class="order-card">
          <div class="order-head"><span>${escapeHtml(m.email)}</span><span class="muted">${escapeHtml(m.created_at)}</span></div>
          ${m.subject ? `<p><strong>${escapeHtml(m.subject)}</strong></p>` : ""}
          ${m.store_subdomain ? `<p class="mono muted">re: ${escapeHtml(m.store_subdomain)}</p>` : ""}
          <p>${escapeHtml(m.message)}</p>
        </div>
      `).join("") : `<p class="empty-state">Nothing in the inbox.</p>`}
    </section>
  `;
  wireOwnerNavExports();
  qs("#ownerFilterForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    location.hash = `#/owner?store=${encodeURIComponent(fd.get("store"))}&status=${encodeURIComponent(fd.get("status"))}&page=1`;
  });
});

route("/owner/store/:id", async (params, app) => {
  if (!(await requireOwnerAuth())) return;
  const d = await apiFetch(`/api/owner/stores/${params.id}`, { auth: "owner" });
  const store = d.store;

  app.innerHTML = `
    <section class="admin admin-wide">
      <div class="admin-header">
        <h1>${escapeHtml(store.business_name || store.subdomain)}</h1>
        <a class="mono" href="${storeLink(store.subdomain)}" target="_blank">${escapeHtml(store.subdomain)}.${escapeHtml(d.root_domain)} ↗</a>
      </div>
      <nav class="admin-tabs"><a href="#/owner">&larr; All stores</a></nav>

      <div class="stat-row">
        <div class="stat-card"><span class="stat-num">${money(d.revenue_cents)}</span><span class="stat-label">Paid revenue</span></div>
        <div class="stat-card"><span class="stat-num">${d.paid_count}</span><span class="stat-label">Paid orders</span></div>
        <div class="stat-card"><span class="stat-num">${d.products.length}</span><span class="stat-label">Products listed</span></div>
      </div>
      <p class="muted">Owner: ${escapeHtml(store.owner_email)} &middot; ${store.is_physical ? "Ships physical items" : "Digital / no shipping"} &middot; Setup fee ${store.setup_paid ? "paid" : "not paid"}</p>
      <p class="muted">Plan: <strong>${escapeHtml(d.plan.label)}</strong>${d.plan.key === "comp" ? ` <span class="badge badge-comp">Gifted</span>` : ""} &middot; ${money(d.used_cents)}${d.cap_cents !== null ? " of " + money(d.cap_cents) : " sold"} this month${d.plan.key === "growth" && store.plan_renews_at ? " &middot; renews " + escapeHtml(store.plan_renews_at.slice(0, 10)) : ""}</p>

      ${store.suspended ? `<div class="result-card" style="border-color:var(--heat)"><p><strong>Suspended.</strong>${store.suspended_reason ? " Reason: " + escapeHtml(store.suspended_reason) : " No reason given."} The seller can't log in and the storefront shows as closed to buyers. Orders and products are untouched — this is fully reversible.</p></div>` : ""}

      <div class="owner-actions">
        ${!store.setup_paid ? `<button class="btn btn-ghost small" id="waiveSetupBtn">Waive $25 setup fee — give them a free website</button>` : ""}
        ${d.plan.key === "comp" ? `<button class="btn btn-ghost small" id="uncompBtn">Revert to Starter</button>` : `<button class="btn btn-ghost small" id="compBtn">Gift free unlimited access (comp)</button>`}
        ${store.suspended
          ? `<button class="btn btn-primary small" id="unsuspendBtn">Reactivate this account</button>`
          : `<button class="btn btn-ghost small" id="suspendToggleBtn" style="border-color:var(--heat);color:var(--heat)">Suspend this account</button>`}
      </div>
      ${!store.suspended ? `
      <form id="suspendForm" class="field" hidden>
        <label class="field"><span class="field-label">Reason (shown to you only, not the seller or buyers)</span><input type="text" id="suspendReason" maxlength="300" placeholder="e.g. reported for a policy violation"></label>
        <button class="btn btn-primary small" type="submit" id="suspendConfirmBtn" style="background:var(--heat);border-color:var(--heat)">Confirm suspend</button>
        <button class="btn btn-ghost small" type="button" id="suspendCancelBtn">Cancel</button>
      </form>` : ""}

      ${d.chart_svg ? `<h2>Revenue — last 14 days</h2><div class="chart-card">${d.chart_svg}</div>` : ""}

      <h2>Products</h2>
      ${d.products.length ? `<table class="table"><thead><tr><th>Name</th><th>Price</th><th>Active</th></tr></thead><tbody>
        ${d.products.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td class="mono">${money(p.price_cents)}</td><td>${p.active ? "yes" : "no"}</td></tr>`).join("")}
      </tbody></table>` : `<p class="empty-state">No products listed yet.</p>`}

      <h2>Orders</h2>
      ${d.orders.length ? `<table class="table"><thead><tr><th>#</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>
        ${d.orders.map((o) => `<tr>
          <td class="mono">#${o.id}</td><td>${escapeHtml(o.customer_name || o.customer_email || "")}</td>
          <td class="mono">${money(o.total_cents)}</td><td><span class="badge badge-${o.paid ? o.status : "awaiting_payment"}">${o.paid ? o.status : "unpaid"}</span></td>
          <td>${escapeHtml(o.created_at)}</td>
        </tr>`).join("")}
      </tbody></table>` : `<p class="empty-state">No orders yet.</p>`}
    </section>
  `;

  const waiveBtn = qs("#waiveSetupBtn");
  if (waiveBtn) waiveBtn.addEventListener("click", async () => {
    await apiFetch(`/api/owner/stores/${params.id}/waive-setup`, { method: "POST", auth: "owner" });
    flash("Setup fee waived — their site is live for free.");
    renderRoute();
  });
  const compBtn = qs("#compBtn");
  if (compBtn) compBtn.addEventListener("click", async () => {
    await apiFetch(`/api/owner/stores/${params.id}/comp`, { method: "POST", auth: "owner" });
    flash("Store comped — free, unlimited, no bill until you undo it.");
    renderRoute();
  });
  const uncompBtn = qs("#uncompBtn");
  if (uncompBtn) uncompBtn.addEventListener("click", async () => {
    await apiFetch(`/api/owner/stores/${params.id}/uncomp`, { method: "POST", auth: "owner" });
    flash("Back to Starter.");
    renderRoute();
  });

  const suspendToggleBtn = qs("#suspendToggleBtn");
  if (suspendToggleBtn) suspendToggleBtn.addEventListener("click", () => {
    qs("#suspendForm").hidden = false;
    suspendToggleBtn.hidden = true;
    qs("#suspendReason").focus();
  });
  const suspendCancelBtn = qs("#suspendCancelBtn");
  if (suspendCancelBtn) suspendCancelBtn.addEventListener("click", () => {
    qs("#suspendForm").hidden = true;
    if (suspendToggleBtn) suspendToggleBtn.hidden = false;
  });
  const suspendForm = qs("#suspendForm");
  if (suspendForm) suspendForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/owner/stores/${params.id}/suspend`, { method: "POST", auth: "owner", json: { reason: qs("#suspendReason").value } });
      flash("Account suspended.");
      renderRoute();
    } catch (err) { flash(err.message, true); }
  });
  const unsuspendBtn = qs("#unsuspendBtn");
  if (unsuspendBtn) unsuspendBtn.addEventListener("click", async () => {
    await apiFetch(`/api/owner/stores/${params.id}/unsuspend`, { method: "POST", auth: "owner" });
    flash("Reactivated.");
    renderRoute();
  });
});

route("/owner/security", async (params, app) => {
  if (!(await requireOwnerAuth())) return;
  const d = await apiFetch("/api/owner/security", { auth: "owner" });

  app.innerHTML = `
    <section class="admin admin-wide">
      <div class="admin-header"><h1>Security</h1></div>
      ${ownerNav("security")}

      <div class="result-card ${d.totp_enabled ? "result-good" : ""}">
        ${d.totp_enabled
          ? `<p>Two-factor authentication is <strong>on</strong> for the owner login.</p>`
          : d.pyotp_installed
            ? `<p>Two-factor authentication is available but <strong>off</strong>. Set <span class="mono">OWNER_TOTP_SECRET</span> in your backend's .env to turn it on.</p>`
            : `<p>Two-factor authentication needs the <span class="mono">pyotp</span> package plus an <span class="mono">OWNER_TOTP_SECRET</span> env var.</p>`}
      </div>

      <h2>Currently locked out</h2>
      ${d.locks.length ? `<table class="table"><thead><tr><th>Scope</th><th>Identifier</th><th>Failed attempts</th><th>Locked until</th></tr></thead><tbody>
        ${d.locks.map((l) => `<tr><td>${escapeHtml(l.scope)}</td><td class="mono">${escapeHtml(l.identifier)}</td><td>${l.attempt_count}</td><td>${escapeHtml(l.locked_until)}</td></tr>`).join("")}
      </tbody></table>` : `<p class="empty-state">Nothing currently locked out.</p>`}

      <h2>Recent activity</h2>
      <p class="muted">Logins (success and failed), lockouts, and sensitive changes — newest 200.</p>
      <table class="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th><th>IP</th></tr></thead><tbody>
        ${d.events.map((e) => `<tr>
          <td class="mono">${escapeHtml(e.created_at)}</td>
          <td>${escapeHtml(e.actor_type)}: ${escapeHtml(e.actor_label)}</td>
          <td><span class="badge ${e.action.includes("success") ? "badge-shipped" : (e.action.includes("failed") ? "badge-awaiting_payment" : "")}">${escapeHtml(e.action)}</span></td>
          <td class="muted">${escapeHtml(e.detail || "")}</td>
          <td class="mono muted">${escapeHtml(e.ip || "")}</td>
        </tr>`).join("")}
      </tbody></table>
    </section>
  `;
  wireOwnerNavExports();
});

// ============================================================================
// VIEWS: public storefronts, checkout, order payment
// ============================================================================

// Darken (negative) or lighten (positive) a #RRGGBB hex color by a percent -
// used to build a two-stop gradient out of nothing but a store's one accent
// color, so a generated banner never looks like a single flat rectangle.
function shadeHex(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const t = percent < 0 ? 0 : 255, p = Math.abs(percent) / 100;
  r = Math.round((t - r) * p) + r; g = Math.round((t - g) * p) + g; b = Math.round((t - b) * p) + b;
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function onAccentColor(hex) {
  // Readable text colour (near-black or white) for whatever accent a seller picked.
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.42 ? "#111418" : "#FFFFFF";
}

function lookFor(meta, key) {
  return (meta.page_looks || []).find((l) => l.key === key) || (meta.page_looks || [])[0];
}

function applyStoreTheme(store, meta) {
  const f = meta.font_pairings[store.font_choice || "signature"] || meta.font_pairings.signature;
  qs("#storeFontLink").href = `https://fonts.googleapis.com/css2?family=${f.gfonts}&display=swap`;
  const accent = store.theme_color || "#E31C3D";
  const look = lookFor(meta, store.page_look || "dark");
  // A storefront owns the whole page while you're on it: repaint the page-level
  // colour variables so the background, nav and text all match the chosen look.
  // renderRoute() calls resetStoreLook() before every navigation, so platform
  // pages (dashboard, signup...) always come back in the normal dark theme.
  if (look) {
    const root = document.documentElement.style;
    root.setProperty("--ink", look.bg); root.setProperty("--surface", look.surface); root.setProperty("--surface-2", look.surface2);
    root.setProperty("--text", look.text); root.setProperty("--muted", look.muted); root.setProperty("--border", look.border);
  }
  return {
    accent, heading: f.heading, body: f.body, onAccent: onAccentColor(accent),
    radius: (store.accent_style || "rounded") === "sharp" ? "4px" : "14px",
    buttonStyle: store.button_style || "solid",
    bannerStyle: store.banner_style || "image",
    cardStyle: store.card_style || "shadow",
    bannerBg: (store.banner_style || "image") === "solid" ? accent : `linear-gradient(135deg, ${accent}, ${shadeHex(accent, -35)})`,
  };
}

function resetStoreLook() {
  const root = document.documentElement.style;
  ["--ink", "--surface", "--surface-2", "--text", "--muted", "--border"].forEach((p) => root.removeProperty(p));
}

function storeScopeStyle(theme) {
  return `--accent:${theme.accent}; --on-accent:${theme.onAccent}; --store-heading-font:${theme.heading}; --store-body-font:${theme.body}; --store-radius:${theme.radius};`;
}

/**
 * The <div>/<img> markup for a storefront's banner, given the computed theme.
 * "Image" with a real uploaded photo wins; otherwise this quietly falls back
 * to the generated gradient (even if "image" is the saved choice) rather than
 * showing a blank gap - a brand-new store with no banner uploaded yet still
 * looks finished instead of empty.
 */
function bannerMarkup(store, theme) {
  if (theme.bannerStyle === "image" && store.banner_image) {
    return `<img class="store-banner" src="${assetUrl(store.banner_image)}" alt="">`;
  }
  return `<div class="store-banner store-banner-generated" style="background:${theme.bannerBg}"></div>`;
}

// A store's page is reachable two ways: the platform's own #/<subdomain>...
// hash routes (always work, including from localhost), or - once
// cloudflare-worker.js is deployed - the store's own real subdomain, where
// the same four views live at plain #/, #/checkout, #/order/:id/pay,
// #/order/:id, with HOST_SUBDOMAIN standing in for the subdomain that would
// otherwise be in the URL. Both paths call the exact same four functions
// below; only how the URL looks differs. storeHash()/storeLink() are what
// pick the right shape for a link depending on which mode is active.

function storeHash(subdomain, path = "") {
  // Same-origin hash for internal navigation (location.hash = ...) - unlike
  // storeLink(), this never needs to cross origins (location.hash can't do
  // that), it just needs the right shape for whichever mode is active.
  return HOST_SUBDOMAIN === subdomain ? path : "/" + subdomain + path;
}

async function renderStorefront(app, subdomain) {
  const meta = await getMeta();
  let d;
  try {
    d = await apiFetch(`/api/stores/${subdomain}`);
  } catch (err) {
    app.innerHTML = `<section class="funnel-step"><h1>Not found</h1>${HOST_SUBDOMAIN ? "" : `<a href="#/">&larr; Home</a>`}</section>`;
    return;
  }
  if (d.closed) {
    app.innerHTML = `<section class="funnel-step"><h1>${escapeHtml(d.store.business_name)} is closed</h1><p class="muted">This storefront isn't taking orders right now.</p></section>`;
    return;
  }
  const store = d.store;
  const theme = applyStoreTheme(store, meta);
  const layout = store.layout_style || "grid";

  app.innerHTML = `
    <section class="storefront store-align-${store.hero_align === "center" ? "center" : "left"}" data-btn="${theme.buttonStyle}" style="${storeScopeStyle(theme)}">
      ${store.announcement ? `<div class="store-announce">${escapeHtml(store.announcement)}</div>` : ""}
      ${bannerMarkup(store, theme)}
      <div class="store-title-row">
        ${store.logo_image ? `<img class="store-logo" src="${assetUrl(store.logo_image)}" alt="">` : ""}
        <div>
          <h1>${escapeHtml(store.business_name)}</h1>
          ${store.tagline ? `<p class="store-tagline">${escapeHtml(store.tagline)}</p>` : ""}
          <p class="mono muted">${escapeHtml(store.subdomain)}.${escapeHtml(d.root_domain)}</p>
        </div>
      </div>
      ${store.about_text ? `<p class="store-about">${escapeHtml(store.about_text)}</p>` : ""}
      ${(store.social_instagram || store.social_website) ? `<p class="store-socials">
        ${store.social_instagram ? `<span class="mono muted">${escapeHtml(store.social_instagram.startsWith("@") ? store.social_instagram : "@" + store.social_instagram)}</span>` : ""}
        ${store.social_website ? `<a href="${escapeHtml(store.social_website)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(store.social_website)}</a>` : ""}
      </p>` : ""}
      ${d.products.length ? `
        <div class="product-grid product-grid-${layout}" style="--cols:${[2, 3, 4].includes(store.grid_columns) ? store.grid_columns : 2}">
          ${d.products.map((p) => `<div class="product-card product-card-${theme.cardStyle}">
            ${p.image_path ? `<img src="${assetUrl(p.image_path)}" alt="${escapeHtml(p.name)}">` : ""}
            <div class="product-card-body"><h3>${escapeHtml(p.name)}</h3><p class="mono">${money(p.price_cents)}</p><p class="muted">${escapeHtml(p.description || "")}</p></div>
          </div>`).join("")}
        </div>
        <a class="btn btn-accent full" href="${storeLink(store.subdomain, "/checkout")}">${escapeHtml(store.order_button_text || "Order")}</a>
      ` : `<p class="empty-state">Nothing listed yet — check back soon.</p>`}
      ${store.footer_note ? `<p class="store-footnote">${escapeHtml(store.footer_note)}</p>` : ""}
    </section>
  `;
}

async function renderCheckout(app, subdomain) {
  const meta = await getMeta();
  const d = await apiFetch(`/api/stores/${subdomain}`);
  if (d.closed) { app.innerHTML = `<section class="funnel-step"><h1>Closed</h1></section>`; return; }
  const store = d.store;
  const theme = applyStoreTheme(store, meta);
  const hasPP = !!store.paypal_me, hasET = !!store.etransfer_email, hasHelcim = !!store.helcim_connected;
  const disc = (hasET && (hasPP || hasHelcim)) ? (store.etransfer_discount_pct || 0) : 0;
  const methodCount = [hasPP, hasET, hasHelcim].filter(Boolean).length;
  const methodCards = {
    etransfer: `<label class="pay-card"><div class="pay-card-head"><input type="radio" name="payment_method" value="etransfer"> <strong>Interac e-Transfer</strong> <span class="pill-free">no fee</span>${disc ? `<span class="pill-save">${disc}% off</span>` : ""}</div><p class="muted small">Send from your bank app — confirms in about a minute.</p></label>`,
    paypal: `<label class="pay-card"><div class="pay-card-head"><input type="radio" name="payment_method" value="paypal"> <strong>PayPal</strong></div><p class="muted small">Pay with your PayPal balance, bank or card.</p></label>`,
    helcim: `<label class="pay-card"><div class="pay-card-head"><input type="radio" name="payment_method" value="helcim"> <strong>Card / bank</strong></div><p class="muted small">Instant checkout, right here — no redirect.</p></label>`,
  };
  // Order of preference when more than one is on: free first, then instant,
  // then redirect-based - first one listed gets the default "checked" radio.
  const order = [hasET && "etransfer", hasHelcim && "helcim", hasPP && "paypal"].filter(Boolean);
  const picker = methodCount > 1 ? `
    <span class="field-label">How would you like to pay?</span>
    <div class="pay-methods">
      ${order.map((key, i) => methodCards[key].replace("<input ", i === 0 ? '<input checked ' : "<input ")).join("")}
    </div>` : "";

  const shipToKey = store.ships_to || "ca";
  const shipToOpt = meta.ship_to_options.find((o) => o.key === shipToKey) || meta.ship_to_options[0];
  const countryOptions = shipToOpt.countries || ["CA", "US", "__other__"];
  const countryLabels = { CA: "Canada", US: "United States", __other__: "Other" };
  const shippingSection = store.is_physical ? `
    <div class="shipping-fields">
      <label class="field"><span class="field-label">Full name</span><input type="text" name="ship_name" required autocomplete="shipping name"></label>
      <label class="field"><span class="field-label">Street address</span><input type="text" name="ship_street" required autocomplete="shipping street-address"></label>
      <label class="field"><span class="field-label">Apt / unit (optional)</span><input type="text" name="ship_unit" autocomplete="shipping address-line2"></label>
      <div class="shipping-row-2">
        <label class="field"><span class="field-label">City</span><input type="text" name="ship_city" required autocomplete="shipping address-level2"></label>
        <label class="field"><span class="field-label">Province / State</span><input type="text" name="ship_province" required autocomplete="shipping address-level1"></label>
      </div>
      <div class="shipping-row-2">
        <label class="field"><span class="field-label" id="postalLabel">Postal code</span><input type="text" name="ship_postal" id="shipPostal" required autocomplete="shipping postal-code"></label>
        <label class="field"><span class="field-label">Country</span>
          <select name="ship_country" id="shipCountry">
            ${countryOptions.map((c) => `<option value="${c === "__other__" ? "" : c}">${escapeHtml(countryLabels[c] || c)}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>
    <p class="hint" id="shipToHint">${escapeHtml(store.business_name)} ships to ${escapeHtml(shipToOpt.label.toLowerCase())}.${store.shipping_flat_cents ? ` Flat shipping: ${money(store.shipping_flat_cents)}.` : " Free shipping."}</p>
  ` : "";

  app.innerHTML = `
    <section class="funnel-step store-scope checkout-page" data-btn="${theme.buttonStyle}" style="${storeScopeStyle(theme)}">
      <a class="back-link" href="${storeLink(store.subdomain)}">&larr; Back to ${escapeHtml(store.business_name)}</a>
      <h1 class="store-checkout-title">Checkout</h1>
      <form id="checkoutForm" class="checkout-grid">
        <div class="checkout-main">
          <div class="co-card">
            <h2 class="co-h"><span>1</span> Your items</h2>
            ${d.products.map((p) => `<div class="checkout-row">
              <div class="co-item"><strong>${escapeHtml(p.name)}</strong><span class="mono muted">${money(p.price_cents)}</span></div>
              <div class="qty-stepper"><button type="button" class="qty-btn" data-step="-1" aria-label="Fewer ${escapeHtml(p.name)}">&minus;</button><input type="number" data-product-id="${p.id}" data-price="${p.price_cents}" min="0" value="0" class="qty-input" aria-label="Quantity of ${escapeHtml(p.name)}"><button type="button" class="qty-btn" data-step="1" aria-label="More ${escapeHtml(p.name)}">+</button></div>
            </div>`).join("")}
          </div>
          <div class="co-card">
            <h2 class="co-h"><span>2</span> Contact</h2>
            <div class="shipping-row-2">
              <label class="field"><span class="field-label">Your name</span><input type="text" name="customer_name" autocomplete="name"></label>
              <label class="field"><span class="field-label">Email (for your receipt)</span><input type="email" name="customer_email" required autocomplete="email"></label>
            </div>
          </div>
          ${store.is_physical ? `<div class="co-card"><h2 class="co-h"><span>3</span> Shipping</h2>${shippingSection}</div>` : ""}
          <div class="co-card">
            <h2 class="co-h"><span>${store.is_physical ? 4 : 3}</span> Payment</h2>
            ${picker || `<p class="muted small" style="margin:0">${hasPP ? "You'll pay with PayPal on the next step." : hasET ? "You'll pay by Interac e-Transfer on the next step." : hasHelcim ? "You'll pay by card or bank on the next step." : "This shop hasn't turned on a payment method yet."}</p>`}
          </div>
        </div>
        <aside class="checkout-side">
          <div class="co-card co-summary">
            <h2 class="co-h">Order summary</h2>
            <div class="checkout-total-row"><span>Subtotal</span><strong id="subtotalOut">$0.00</strong></div>
            ${store.is_physical ? `<div class="checkout-total-row"><span>Shipping</span><strong id="shippingOut">${money(store.shipping_flat_cents || 0)}</strong></div>` : ""}
            <div class="checkout-total-row checkout-total-row-final"><span>Total</span><strong id="totalOut">${money(store.shipping_flat_cents || 0)}</strong></div>
            <label class="agree-row"><input type="checkbox" name="agree_terms" required><span>I agree to the <a href="#/terms" target="_blank">Buyer Terms</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>. I understand ${escapeHtml(store.business_name)} is an independent seller, not Peltier Development.</span></label>
            <button class="btn btn-accent btn-lg full" type="submit">Place order</button>
            <p class="secure-note"><svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 9V7a5 5 0 0110 0v2M4 9h12v8H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg> You pay ${escapeHtml(store.business_name)} directly. We never see or store your card or bank details.</p>
          </div>
        </aside>
      </form>
  `;

  // Live running total - purely cosmetic, the server recomputes the real total
  // from its own prices and shipping rate regardless of what this shows.
  function refreshTotal() {
    const subtotal = qsa('[data-product-id]').reduce((sum, el) => sum + (parseInt(el.dataset.price, 10) * (parseInt(el.value, 10) || 0)), 0);
    const shipping = store.is_physical ? (store.shipping_flat_cents || 0) : 0;
    qs("#subtotalOut").textContent = money(subtotal);
    qs("#totalOut").textContent = money(subtotal + shipping);
  }
  qsa('[data-product-id]').forEach((el) => el.addEventListener("input", refreshTotal));
  qsa(".qty-btn").forEach((btn) => btn.addEventListener("click", () => {
    const input = btn.parentElement.querySelector("input");
    input.value = Math.max(0, (parseInt(input.value, 10) || 0) + parseInt(btn.dataset.step, 10));
    refreshTotal();
  }));

  // Postal code field adapts its label/placeholder to the chosen country, and
  // narrows the allowed country list to what this seller actually ships to.
  if (store.is_physical) {
    const postalLabel = qs("#postalLabel"), postalInput = qs("#shipPostal"), countrySelect = qs("#shipCountry");
    function refreshPostal() {
      const c = countrySelect.value;
      if (c === "US") { postalLabel.textContent = "ZIP code"; postalInput.placeholder = "90210"; }
      else if (c === "CA") { postalLabel.textContent = "Postal code"; postalInput.placeholder = "A1A 1A1"; }
      else { postalLabel.textContent = "Postal / ZIP code"; postalInput.placeholder = ""; }
    }
    countrySelect.addEventListener("change", refreshPostal);
    refreshPostal();
  }

  qs("#checkoutForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const items = qsa('[data-product-id]', e.target)
      .map((el) => ({ product_id: parseInt(el.dataset.productId, 10), qty: parseInt(el.value, 10) || 0 }))
      .filter((it) => it.qty > 0);
    try {
      const data = await apiFetch(`/api/stores/${subdomain}/checkout`, {
        method: "POST",
        json: {
          items, customer_name: fd.get("customer_name"), customer_email: fd.get("customer_email"),
          agree_terms: fd.get("agree_terms") === "on", payment_method: fd.get("payment_method") || "",
          shipping: store.is_physical ? {
            name: fd.get("ship_name"), street: fd.get("ship_street"), unit: fd.get("ship_unit"),
            city: fd.get("ship_city"), province: fd.get("ship_province"),
            postal_code: fd.get("ship_postal"), country: fd.get("ship_country"),
          } : undefined,
        },
      });
      location.hash = "#" + storeHash(subdomain, `/order/${data.order_id}/pay`);
    } catch (err) {
      if (err.data && err.data.code === "plan_limit") {
        app.innerHTML = `<section class="funnel-step">
          <h1>Sorry — this shop can't take new orders right now.</h1>
          <p class="lede">${escapeHtml(store.business_name)} has reached its plan's sales limit for this month (${money(err.data.used_cents)} of ${err.data.cap_cents !== null ? money(err.data.cap_cents) : "∞"}). It'll reopen once the seller upgrades their plan, or automatically next calendar month.</p>
          <a class="btn btn-ghost full" href="${storeLink(subdomain)}">&larr; Back to the shop</a>
        </section>`;
      } else {
        flash(err.message, true);
      }
    }
  });
}

async function renderOrderPay(app, subdomain, orderId) {
  const url = `/api/stores/${subdomain}/orders/${orderId}`;
  const d = await apiFetch(url);
  if (d.order.paid) { location.hash = "#" + storeHash(subdomain, `/order/${orderId}`); return; }
  if (!d.payment_connected) {
    app.innerHTML = `<section class="funnel-step"><h1>Order placed</h1><p class="lede">This store hasn't finished setting up payments yet — the seller has your order and will follow up on how to pay.</p></section>`;
    return;
  }

  const m = d.order.payment_method;
  if (m === "etransfer" || m === "paypal") {
    app.innerHTML = `<section class="funnel-step"><h1>Complete your payment</h1><p class="lede">${escapeHtml(d.store.business_name)} — order #${d.order.id}</p><div id="payArea"></div></section>`;
    renderPayInstructions(qs("#payArea"), {
      method: m, amountCents: d.order.etransfer_amount_cents || d.order.total_cents, baseCents: d.order.total_cents,
      email: d.store.etransfer_email, paypalLink: d.paypal_link, ref: d.order.payment_ref,
      auto: d.auto_verify, confirmer: d.store.business_name,
      check: async () => (await apiFetch(url)).order.paid,
      onPaid: () => { location.hash = "#" + storeHash(subdomain, `/order/${orderId}`); },
    });
    return;
  }

  app.innerHTML = `
    <section class="funnel-step">
      <h1>Pay for your order</h1>
      <p class="lede">${money(d.order.total_cents)} CAD, processed through Helcim, straight to ${escapeHtml(d.store.business_name)}'s own account.</p>
      <button class="btn btn-primary full" id="payBtn">Pay ${money(d.order.total_cents)} now</button>
      <div id="payStatus" class="wait-state" hidden><span class="pulse-dot"></span> Confirming with Helcim…</div>
      <p class="hint hint-error" id="payError" hidden></p>
    </section>
  `;
  qs("#payBtn").addEventListener("click", () => {
    qs("#payError").hidden = true;
    qs("#payStatus").hidden = false;
    runHelcimPay({
      initPath: `${url}/pay/init`, confirmPath: `${url}/pay/confirm`, auth: null,
      onDone: (ok, error) => {
        if (ok) { location.hash = "#" + storeHash(subdomain, `/order/${orderId}`); }
        else { qs("#payStatus").hidden = true; qs("#payError").hidden = false; qs("#payError").textContent = error || "Payment didn't go through."; }
      },
    });
  });
}

async function renderOrderStatus(app, subdomain, orderId) {
  const d = await apiFetch(`/api/stores/${subdomain}/orders/${orderId}`);
  const o = d.order;
  app.innerHTML = `
    <section class="funnel-step">
      <h1>Order #${o.id}</h1>
      <p class="badge badge-${o.paid ? o.status : "awaiting_payment"}">${o.paid ? o.status : "unpaid"}</p>
      <ul>${o.items.map((it) => `<li>${it.qty}× ${escapeHtml(it.name)} — ${money(it.price_cents * it.qty)}</li>`).join("")}</ul>
      ${o.shipping_cents ? `<p class="muted">Shipping: ${money(o.shipping_cents)}</p>` : ""}
      <p class="mono">Total: ${money(o.total_cents)}</p>
      ${o.shipping_address ? `<p class="muted" style="white-space:pre-line">Shipping to:<br>${escapeHtml(o.shipping_address)}</p>` : ""}
      ${o.tracking_number ? `<p class="muted">Tracking: ${escapeHtml(o.tracking_carrier || "")} ${escapeHtml(o.tracking_number)}</p>` : ""}
      ${!o.paid ? `<a class="btn btn-primary" href="${storeLink(subdomain, `/order/${orderId}/pay`)}">Pay now</a>` : ""}
      <p><a class="mono" href="${storeLink(subdomain)}">&larr; Back to shop</a></p>
    </section>
  `;
}

// Real-subdomain URLs - registered FIRST and deliberately, so they win over
// the same-shaped /:subdomain patterns below (route() checks patterns in
// registration order and stops at the first match - "/checkout" and
// "/:subdomain" match an identical single-segment shape, so whichever is
// registered first decides what "#/checkout" even means). Off a deployed
// cloudflare-worker.js these just bounce home rather than dead-ending, since
// HOST_SUBDOMAIN is null anywhere these paths weren't intentionally reached.
// "checkout" and "order" are reserved store names on the backend for exactly
// this reason - see RESERVED_SUBDOMAINS in app.py.
route("/checkout", (params, app) => {
  if (!HOST_SUBDOMAIN) { location.hash = "#/"; return; }
  return renderCheckout(app, HOST_SUBDOMAIN);
});
route("/order/:orderId/pay", (params, app) => {
  if (!HOST_SUBDOMAIN) { location.hash = "#/"; return; }
  return renderOrderPay(app, HOST_SUBDOMAIN, params.orderId);
});
route("/order/:orderId", (params, app) => {
  if (!HOST_SUBDOMAIN) { location.hash = "#/"; return; }
  return renderOrderStatus(app, HOST_SUBDOMAIN, params.orderId);
});

// Platform-mode URLs - always work, from any origin including localhost.
route("/:subdomain", (params, app) => renderStorefront(app, params.subdomain));
route("/:subdomain/checkout", (params, app) => renderCheckout(app, params.subdomain));
route("/:subdomain/order/:orderId/pay", (params, app) => renderOrderPay(app, params.subdomain, params.orderId));
route("/:subdomain/order/:orderId", (params, app) => renderOrderStatus(app, params.subdomain, params.orderId));

route("/owner/fees", async (params, app) => {
  if (!(await requireOwnerAuth())) return;
  const [w, pp] = await Promise.all([
    apiFetch("/api/owner/fee-whatif", { auth: "owner" }),
    apiFetch("/api/owner/platform-payments", { auth: "owner" }),
  ]);
  app.innerHTML = `
    <section class="admin admin-wide">
      <div class="admin-header"><h1>Fees &amp; platform payments</h1></div>
      ${ownerNav("fees")}

      <h2>What Helcim would cost you (estimate)</h2>
      <p class="muted">No money moves here. If a store's sales ran through a Helcim account of yours: what it costs per sale, and what happens if the store hits its plan cap. Bank-transfer rate 0.5% + $0.25 (max $6); card ~2.49% + $0.25, or 3% + $0.25 as the pessimistic case. Stores with no sales yet are assumed to average $25.00.</p>
      <table class="table"><thead><tr><th>Store</th><th>Plan</th><th>Avg order</th><th>Per sale: bank / card</th><th>At cap: orders</th><th>Bank</th><th>Card</th><th>Card @3%</th></tr></thead><tbody>
        ${w.stores.map((s) => `<tr>
          <td>${escapeHtml(s.subdomain)}</td><td>${escapeHtml(s.plan)}</td>
          <td class="mono">${money(s.avg_order_cents)}${s.avg_is_assumed ? " *" : ""}</td>
          <td class="mono">${money(s.per_order.ach_cents)} / ${money(s.per_order.card_cents)}</td>
          <td class="mono">${s.at_cap.orders} <span class="muted">(${money(s.at_cap.cap_cents)}${s.at_cap.cap_is_assumed ? " shown" : ""})</span></td>
          <td class="mono">${money(s.at_cap.ach_cents)}</td><td class="mono">${money(s.at_cap.card_cents)}</td><td class="mono">${money(s.at_cap.card_high_cents)}</td>
        </tr>`).join("") || `<tr><td colspan="8" class="muted">No stores yet.</td></tr>`}
      </tbody></table>
      <p class="hint">* assumed average. Unlimited plans are shown at $10,000/month.</p>

      <h2>Platform payments (setup fees &amp; plans)</h2>
      ${pp.auto ? "" : `<div class="result-card"><p>Auto-confirm is <strong>off</strong>: set <span class="mono">PLATFORM_IMAP_USER</span> and <span class="mono">PLATFORM_IMAP_PASSWORD</span> in your .env. Until then, confirm payments by hand below.</p></div>`}
      ${pp.payments.length ? `<table class="table"><thead><tr><th>When</th><th>Store</th><th>For</th><th>Via</th><th>Amount</th><th>Code</th><th>Status</th><th></th></tr></thead><tbody>
        ${pp.payments.map((p) => `<tr>
          <td class="mono">${escapeHtml(p.created_at)}</td><td>${escapeHtml(p.subdomain)}</td><td>${escapeHtml(p.kind)}${p.plan_key ? " · " + escapeHtml(p.plan_key) : ""}</td>
          <td>${escapeHtml(p.method)}</td><td class="mono">${money(p.expected_cents)}</td><td class="mono">${escapeHtml(p.ref)}</td>
          <td><span class="badge ${p.status === "paid" ? "badge-shipped" : "badge-awaiting_payment"}">${escapeHtml(p.status)}</span></td>
          <td>${p.status === "pending" ? `<button class="btn btn-ghost small" data-confirm="${p.id}">I got this — confirm</button>` : ""}</td>
        </tr>`).join("")}
      </tbody></table>` : `<p class="empty-state">No platform payments yet.</p>`}
      ${testBoxHtml("ownerTest")}
    </section>`;
  wireOwnerNavExports();
  wireTestBox("ownerTest", "/api/owner/test-email", "owner");
  qsa("[data-confirm]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    await apiFetch(`/api/owner/platform-payments/${b.dataset.confirm}/confirm`, { method: "POST", auth: "owner" });
    flash("Confirmed."); renderRoute();
  }));
});

// ---------------------------------------------------------------- bootstrap

// Boot: ask the backend once. If it answers, the site behaves exactly as it
// always did (no chip, nothing extra). If not, demo mode takes over.
(async function boot() {
  if (Demo.available && !(await Demo.probe())) Demo.set(true, { render: false });
  renderRoute();
  updateNav();
})();
