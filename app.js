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

// ---------------------------------------------------------------- API helper

async function apiFetch(path, { method = "GET", json = null, form = null, auth = null } = {}) {
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
  document.getElementById("app").innerHTML = '<section class="funnel-step"><h1>Not found</h1><a href="#/">&larr; Home</a></section>';
}

function updateNav() {
  const loggedIn = !!Auth.getStoreToken();
  const loginLink = document.getElementById("navLogin");
  const signupLink = document.getElementById("navSignup");
  if (loggedIn) {
    loginLink.textContent = "My store";
    loginLink.href = "#/admin";
    signupLink.textContent = "Log out";
    signupLink.href = "#/logout";
  } else {
    loginLink.textContent = "Log in";
    loginLink.href = "#/login";
    signupLink.textContent = "Sign up";
    signupLink.href = "#/create";
  }
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
  const meta = await getMeta();
  app.innerHTML = `
    <section class="hero">
      <h1>Sell online. Keep the fee out of it.</h1>
      <p class="lede">Pick a name, list what you're selling, and get paid straight into your own PayPal or bank account. $25 to open the doors — nothing else until you outgrow the free tier.</p>
      <a class="btn btn-primary" href="#/create">Start your store</a>
      <a class="btn btn-ghost" href="#/story">Why this exists</a>
    </section>
    <section>
      <h2>How it works</h2>
      <ol class="steps">
        <li>Pick a store name — letters only, checked live against what's taken.</li>
        <li>Tell us if you're shipping physical goods or selling something digital/a service.</li>
        <li>Pay a one-time $25 setup fee, then choose how you get paid — PayPal, e-Transfer, or both.</li>
        <li>List products, share your link, and get paid straight into your own account.</li>
      </ol>
    </section>
    <section>
      <h2>Plans</h2>
      <div class="plan-grid">
        ${meta.plan_order.map((key) => {
          const p = meta.plans[key];
          const icon = { starter: "❄️", growth: "🌡️", scale: "🔥" }[key] || "";
          return `<div class="plan-card plan-card-${key}">
            <div class="plan-card-icon">${icon}</div>
            <h3>${p.label}</h3>
            <p class="plan-price">${p.kind === "usage" ? "1%<span class=\"muted\">/sale</span>" : (p.price_dollars ? "$" + p.price_dollars.toFixed(0) + "<span class=\"muted\">/mo</span>" : "Free")}</p>
            <p class="muted">${escapeHtml(p.tagline)}</p>
          </div>`;
        }).join("")}
      </div>
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
    <section class="funnel-step">
      <h1>Pick your store's name</h1>
      <p class="lede">Letters only, a-z — this becomes your storefront's address.</p>
      <label class="field">
        <span class="field-label">Store name</span>
        <input type="text" id="subdomainInput" autocomplete="off" autofocus>
      </label>
      <p id="subdomainResult" class="hint"></p>
      <button class="btn btn-primary full" id="continueBtn" disabled>Continue</button>
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
          resultEl.innerHTML = `<span class="mono">${escapeHtml(data.cleaned)}.${escapeHtml(meta.root_domain)}</span> is available!`;
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
    <section class="funnel-step">
      <h1>Set up ${escapeHtml(subdomain)}.${escapeHtml(meta.root_domain)}</h1>
      <form id="signupForm">
        <label class="field"><span class="field-label">Business name</span><input type="text" name="business_name" placeholder="${escapeHtml(subdomain)}"></label>
        <label class="field"><span class="field-label">Your email</span><input type="email" name="email" required></label>
        <label class="field"><span class="field-label">Password</span><input type="password" name="password" required minlength="8"></label>
        <span class="field-label">Does this store ship physical items?</span>
        <div class="chip-row">
          <label class="chip-radio"><input type="radio" name="is_physical" value="yes" required> Yes — ships physical goods</label>
          <label class="chip-radio"><input type="radio" name="is_physical" value="no"> No — digital or a service</label>
        </div>
        <label class="chip-radio agree-row">
          <input type="checkbox" name="agree_terms" required>
          I agree to the <a href="#/terms" target="_blank">Seller Terms</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>.
        </label>
        <button class="btn btn-primary full" type="submit">Create my store</button>
      </form>
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
    <section class="funnel-step">
      <h1>Welcome back</h1>
      <p class="lede">${next ? "Log in and we'll take you right back to where you were." : "Log in to your store."}</p>
      <form id="loginForm">
        <label class="field"><span class="field-label">Email</span><input type="email" name="email" required autofocus autocomplete="username"></label>
        <label class="field"><span class="field-label">Password</span><div class="pw-row"><input type="password" name="password" id="loginPw" required autocomplete="current-password"><button type="button" class="pw-toggle" id="loginPwToggle">Show</button></div></label>
        <button class="btn btn-primary full" type="submit">Log in</button>
      </form>
      <p class="hint">New here? <a href="#/create">Start your store</a></p>
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
    ${tabs.map(([path, label]) => `<a class="${active === path ? "active" : ""}" href="#/${path}">${label}</a>`).join("")}
    <a href="#/logout">Log out</a>
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
  }, 10000);
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

async function renderPlatformPay(app, { kind, planKey, title, blurb, doneHash }) {
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
    <section class="funnel-step">
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${escapeHtml(blurb)}</p>
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
    kind: "setup_fee", title: "One-time setup fee",
    blurb: "$25.00 CAD opens your store. Pay by e-Transfer (no fees) or PayPal — it confirms automatically.",
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
  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>${escapeHtml(store.business_name)}</h1></div>
      ${adminNav("admin")}
      ${d.is_cut_off ? `<div class="result-card" style="border-color:var(--heat)"><p>Past the ${escapeHtml(d.site_cutoff)} cutoff — your storefront is showing customers the closed page.</p></div>` : ""}
      ${!d.payment_connected ? `<div class="result-card"><p>Customers can browse and order, but can't pay until you <a href="#/admin/payment-settings">connect your Helcim account</a>.</p></div>` : ""}
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

      <p><a class="mono" href="#/store/${encodeURIComponent(store.subdomain)}" target="_blank">View your storefront ↗</a></p>
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
        <td>${p.image_path ? `<img src="${API_BASE}/${p.image_path}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;">` : ""}</td>
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
      <form id="productForm" class="field">
        <label class="field"><span class="field-label">Name</span><input type="text" name="name" required></label>
        <label class="field"><span class="field-label">Description</span><textarea name="description" rows="2"></textarea></label>
        <label class="field"><span class="field-label">Price (CAD)</span><input type="number" name="price" step="0.01" min="0.01" required></label>
        <label class="field"><span class="field-label">Photo (optional)</span><input type="file" name="image" accept="image/*"></label>
        <button class="btn btn-primary" type="submit">Add product</button>
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
        <p>${o.items.map((it) => `${it.qty}× ${escapeHtml(it.name)}`).join(", ")} — <span class="mono">${money(o.total_cents)}</span></p>
        ${o.paid ? `<p class="muted">${escapeHtml(o.customer_name || "")} &lt;${escapeHtml(o.customer_email || "")}&gt;${o.shipping_address ? " — " + escapeHtml(o.shipping_address) : ""}</p>` : ""}
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

  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>${welcome ? "You're in. How do you want to get paid?" : "Payments"}</h1></div>
      ${adminNav("admin/payment-settings")}
      <p class="lede">Tick one or both. Customers only see the methods you turn on. The money goes straight to you — never through us.</p>

      <div class="pay-methods">
        <div class="pay-card ${ppOn ? "on" : ""}" id="ppCard">
          <div class="pay-card-head"><input type="checkbox" id="ppCheck" ${ppOn ? "checked" : ""}> <strong>PayPal</strong></div>
          <div class="fee-box fee-box-cost"><strong>PayPal charges fees.</strong> 2.9% + $0.30 per sale, taken by PayPal. Buyers from the US add 0.8%, other countries 1.0%. Mostly selling items under $12? Ask PayPal for its micropayment rate (5% + $0.05) — it then applies to every sale in that account. <a href="https://www.paypal.com/ca/business/paypal-business-fees" target="_blank" rel="noopener noreferrer">PayPal's fee page</a></div>
          <div class="pay-fields" id="ppFields" ${ppOn ? "" : "hidden"}>
            <label class="field"><span class="field-label">Your PayPal.me name</span><input type="text" id="ppMe" placeholder="yourshop" value="${escapeHtml(s.paypal_me || "")}"></label>
            <label class="field"><span class="field-label">Email your PayPal account uses</span><input type="email" id="ppEmail" placeholder="you@example.com" value="${escapeHtml(s.paypal_email || "")}"></label>
          </div>
        </div>
        <div class="pay-card ${etOn ? "on" : ""}" id="etCard">
          <div class="pay-card-head"><input type="checkbox" id="etCheck" ${etOn ? "checked" : ""}> <strong>Interac e-Transfer</strong></div>
          <div class="fee-box fee-box-free"><strong>$0 in fees from us.</strong> No percentage, no per-sale charge. Receiving is free at most Canadian banks — check yours.</div>
          <div class="pay-fields" id="etFields" ${etOn ? "" : "hidden"}>
            <label class="field"><span class="field-label">Your e-Transfer (Autodeposit) email</span><input type="email" id="etEmail" placeholder="you@example.com" value="${escapeHtml(s.etransfer_email || "")}"></label>
            <label class="field" id="discRow" hidden><span class="field-label">Discount for paying by e-Transfer (the free option)</span>
              <select id="etDisc">${[0, 1, 2, 3, 5].map((n) => `<option value="${n}" ${s.etransfer_discount_pct === n ? "selected" : ""}>${n === 0 ? "No discount" : n + "% off"}</option>`).join("")}</select>
            </label>
          </div>
        </div>
      </div>

      <div class="fee-try">
        <label>Try a price: $ <input type="number" id="tryPrice" value="25" min="1" step="0.01"></label>
        <span>PayPal fee: <strong id="tryPP"></strong></span>
        <span>e-Transfer fee: <strong>$0.00</strong></span>
      </div>
      <button class="btn btn-primary full" id="saveMethods">Save payment methods</button>

      <h2>Automatic confirmation</h2>
      ${em.configured
        ? `<div class="result-card result-good"><p>Watching <span class="mono">${escapeHtml(em.imap_user)}</span>. Orders flip to paid on their own when your bank's or PayPal's "you got paid" email arrives. Last check: ${escapeHtml(em.last_checked_at || "not yet")}.${em.last_error ? ` <strong>Problem:</strong> ${escapeHtml(em.last_error)}` : ""}</p></div>`
        : `<p class="hint">Off — you'd be marking orders paid by hand. Turn this on and payments confirm themselves.</p>`}
      <form id="emailForm" class="field">
        <label class="field"><span class="field-label">Mail server</span><input type="text" name="imap_host" value="${escapeHtml(em.imap_host || "imap.gmail.com")}" required></label>
        <label class="field"><span class="field-label">The inbox your bank / PayPal emails go to</span><input type="email" name="imap_user" value="${escapeHtml(em.imap_user || s.etransfer_email || s.paypal_email || "")}" required></label>
        <label class="field"><span class="field-label">App password</span><div class="pw-row"><input type="password" name="imap_password" id="imapPw" required autocomplete="off"><button type="button" class="pw-toggle" id="imapPwToggle">Show</button></div></label>
        <button class="btn btn-primary" type="submit">${em.configured ? "Update" : "Turn on"}</button>
        ${em.configured ? `<button class="btn btn-ghost" type="button" id="emailOff">Turn off</button>` : ""}
      </form>
      <p class="hint"><strong>Do this with a Gmail made just for payments.</strong> An email only counts if it's from a real bank or PayPal, passes its signature check, is addressed to you, and matches an order's exact amount.</p>
      <details class="test-box">
        <summary>Full guide — setting up automatic confirmation, step by step</summary>
        <ol class="guide-steps">
          <li><strong>Make a dedicated Gmail.</strong> Not your personal one — a fresh Gmail used only for payment notifications. This keeps the app's access limited to payments only, never your real inbox.</li>
          <li><strong>Point your payments here.</strong> On PayPal, set this Gmail as your account email (or the email tied to it). For e-Transfer, register it as your bank's Autodeposit email. The notifications you're watching for have to actually land here.</li>
          <li><strong>Turn on 2-Step Verification</strong> on that Gmail: <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">myaccount.google.com/security</a> → find "2-Step Verification" → turn it on. App Passwords won't appear as an option until this is done.</li>
          <li><strong>Generate an App Password:</strong> <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">myaccount.google.com/apppasswords</a> → name it anything (e.g. "peltdev payments") → Create. Google shows a 16-character code — copy it now, it's shown only once.</li>
          <li><strong>Fill in the three fields above:</strong> mail server <code>imap.gmail.com</code>, the Gmail address itself, and the 16-character code you just copied (spaces in it don't matter).</li>
          <li><strong>Click "Turn on."</strong> The app logs in once to confirm it works, then starts watching automatically — checking every 30 seconds while an order's waiting, backing off once nothing is.</li>
          <li><strong>Test it before trusting it:</strong> send yourself a small real payment through your own PayPal.me link or e-Transfer, forward or open the confirmation email, and paste the full thing into the "Test an email" box below (Gmail: open the email → ⋮ → "Show original" → copy everything). It'll tell you exactly what would happen and why, without marking anything paid.</li>
        </ol>
        <p class="hint">Don't see "App passwords" at all? 2-Step Verification usually isn't fully on yet — finish that first. On a Google Workspace account, an admin may have this disabled entirely; a personal Gmail always supports it.</p>
      </details>
      ${testBoxHtml("emailTest")}
      ${welcome ? `<a class="btn btn-ghost full" href="#/admin">Go to my dashboard →</a>` : ""}
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

  app.innerHTML = `
    <section class="admin">
      <div class="admin-header"><h1>Customize</h1></div>
      ${adminNav("admin/customize")}
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
          ${store.logo_image ? `<img class="logo-preview" src="${API_BASE}/${store.logo_image}">` : ""}
          <label class="field"><span class="field-label">Banner photo</span><input type="file" name="banner" accept="image/*"></label>
          ${store.banner_image ? `<img class="banner-preview" src="${API_BASE}/${store.banner_image}" style="max-width:100%;border-radius:8px;">` : ""}

          <label class="field"><span class="field-label">Tagline</span><input type="text" name="tagline" id="taglineInput" maxlength="120" value="${escapeHtml(store.tagline || "")}"></label>
          <label class="field"><span class="field-label">About your shop</span><textarea name="about_text" id="aboutInput" rows="3" maxlength="600">${escapeHtml(store.about_text || "")}</textarea></label>

          <span class="field-label">Typeface</span>
          <div class="chip-row">
            ${Object.entries(meta.font_pairings).map(([key, f]) => `<label class="chip-radio"><input type="radio" name="font_choice" value="${key}" ${currentFont === key ? "checked" : ""}> ${escapeHtml(f.label)}</label>`).join("")}
          </div>
          <span class="field-label">Product layout</span>
          <div class="chip-row">
            ${meta.layout_styles.map((s) => `<label class="chip-radio"><input type="radio" name="layout_style" value="${s.key}" ${currentLayout === s.key ? "checked" : ""}> ${escapeHtml(s.label)}</label>`).join("")}
          </div>
          <span class="field-label">Corner style</span>
          <div class="chip-row">
            ${meta.accent_styles.map((s) => `<label class="chip-radio"><input type="radio" name="accent_style" value="${s.key}" ${currentAccent === s.key ? "checked" : ""}> ${escapeHtml(s.label)}</label>`).join("")}
          </div>

          <label class="field"><span class="field-label">Instagram (optional)</span><input type="text" name="social_instagram" value="${escapeHtml(store.social_instagram || "")}"></label>
          <label class="field"><span class="field-label">Website (optional)</span><input type="text" name="social_website" value="${escapeHtml(store.social_website || "")}"></label>

          <button class="btn btn-primary full" type="submit">Save</button>
        </form>
        <aside class="preview-pane">
          <span class="field-label">Live preview</span>
          <div class="preview-frame" id="previewFrame" style="--accent: ${store.theme_color || "#E31C3D"}; --pv-radius: ${currentAccent === "sharp" ? "4px" : "14px"};">
            <div class="pv-banner ${store.banner_image ? "" : "pv-banner-empty"}" id="pvBanner" style="${store.banner_image ? `background-image:url('${API_BASE}/${store.banner_image}')` : ""}"></div>
            <div class="pv-body">
              <div class="pv-title-row">
                ${store.logo_image ? `<img class="pv-logo" id="pvLogo" src="${API_BASE}/${store.logo_image}">` : `<div class="pv-logo pv-logo-empty" id="pvLogo"></div>`}
                <div><div class="pv-name">${escapeHtml(store.business_name)}</div><div class="pv-tagline" id="pvTagline">${escapeHtml(store.tagline || "Your tagline here")}</div></div>
              </div>
              <p class="pv-about" id="pvAbout">${escapeHtml(store.about_text || "A line or two about your shop shows up here.")}</p>
              <div class="pv-products pv-products-${currentLayout}" id="pvProducts">
                <div class="pv-product"><div class="pv-product-img"></div><div class="pv-product-name">Sample item</div><div class="pv-product-price">$24.00</div></div>
                <div class="pv-product"><div class="pv-product-img"></div><div class="pv-product-name">Another item</div><div class="pv-product-price">$18.00</div></div>
              </div>
              <div class="pv-btn">Order</div>
            </div>
          </div>
          <p class="hint">Updates instantly as you pick — nothing here is saved until you click Save.</p>
        </aside>
      </div>
      <a class="mono" href="#/store/${encodeURIComponent(store.subdomain)}" target="_blank">View your storefront ↗</a>
    </section>
  `;

  // live preview wiring
  const frame = qs("#previewFrame");
  function setAccent(hex) { if (/^#[0-9A-Fa-f]{6}$/.test(hex)) frame.style.setProperty("--accent", hex); }
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
  qsa('input[name="layout_style"]').forEach((el) => el.addEventListener("change", function () { qs("#pvProducts").className = "pv-products pv-products-" + this.value; }));
  qsa('input[name="accent_style"]').forEach((el) => el.addEventListener("change", function () { frame.style.setProperty("--pv-radius", this.value === "sharp" ? "4px" : "14px"); }));

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
        <a class="mono" href="#/store/${encodeURIComponent(store.subdomain)}" target="_blank">${escapeHtml(store.subdomain)}.${escapeHtml(d.root_domain)} ↗</a>
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

function applyStoreTheme(store, meta) {
  const f = meta.font_pairings[store.font_choice || "signature"] || meta.font_pairings.signature;
  qs("#storeFontLink").href = `https://fonts.googleapis.com/css2?family=${f.gfonts}&display=swap`;
  return {
    accent: store.theme_color || "#E31C3D",
    heading: f.heading, body: f.body,
    radius: (store.accent_style || "rounded") === "sharp" ? "4px" : "14px",
  };
}

route("/store/:subdomain", async (params, app) => {
  const meta = await getMeta();
  let d;
  try {
    d = await apiFetch(`/api/stores/${params.subdomain}`);
  } catch (err) {
    app.innerHTML = `<section class="funnel-step"><h1>Not found</h1><a href="#/">&larr; Home</a></section>`;
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
    <section class="storefront" style="--accent:${theme.accent}; --store-heading-font:${theme.heading}; --store-body-font:${theme.body}; --store-radius:${theme.radius};">
      ${store.banner_image ? `<img class="store-banner" src="${API_BASE}/${store.banner_image}" alt="">` : ""}
      <div class="store-title-row">
        ${store.logo_image ? `<img class="store-logo" src="${API_BASE}/${store.logo_image}" alt="">` : ""}
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
        <div class="product-grid product-grid-${layout}">
          ${d.products.map((p) => `<div class="product-card">
            ${p.image_path ? `<img src="${API_BASE}/${p.image_path}" alt="${escapeHtml(p.name)}">` : ""}
            <div class="product-card-body"><h3>${escapeHtml(p.name)}</h3><p class="mono">${money(p.price_cents)}</p><p class="muted">${escapeHtml(p.description || "")}</p></div>
          </div>`).join("")}
        </div>
        <a class="btn btn-accent full" href="#/store/${encodeURIComponent(store.subdomain)}/checkout">Order</a>
      ` : `<p class="empty-state">Nothing listed yet — check back soon.</p>`}
    </section>
  `;
});

route("/store/:subdomain/checkout", async (params, app) => {
  const meta = await getMeta();
  const d = await apiFetch(`/api/stores/${params.subdomain}`);
  if (d.closed) { app.innerHTML = `<section class="funnel-step"><h1>Closed</h1></section>`; return; }
  const store = d.store;
  const theme = applyStoreTheme(store, meta);
  const hasPP = !!store.paypal_me, hasET = !!store.etransfer_email;
  const disc = (hasPP && hasET) ? (store.etransfer_discount_pct || 0) : 0;
  const picker = (hasPP && hasET) ? `
    <span class="field-label">How would you like to pay?</span>
    <div class="pay-methods">
      <label class="pay-card"><div class="pay-card-head"><input type="radio" name="payment_method" value="etransfer" checked> <strong>Interac e-Transfer</strong> <span class="pill-free">no fee</span>${disc ? `<span class="pill-save">${disc}% off</span>` : ""}</div><p class="muted small">Send from your bank app — confirms in about a minute.</p></label>
      <label class="pay-card"><div class="pay-card-head"><input type="radio" name="payment_method" value="paypal"> <strong>PayPal</strong></div><p class="muted small">Pay with your PayPal balance, bank or card.</p></label>
    </div>` : "";

  app.innerHTML = `
    <section class="funnel-step" style="--accent:${theme.accent}; --store-heading-font:${theme.heading}; --store-body-font:${theme.body}; --store-radius:${theme.radius};">
      <h1 class="store-checkout-title">Your order — ${escapeHtml(store.business_name)}</h1>
      <form id="checkoutForm">
        ${d.products.map((p) => `<div class="checkout-row">
          <div><strong>${escapeHtml(p.name)}</strong><p class="mono muted">${money(p.price_cents)}</p></div>
          <input type="number" data-product-id="${p.id}" min="0" value="0" class="qty-input">
        </div>`).join("")}
        <label class="field"><span class="field-label">Your name</span><input type="text" name="customer_name"></label>
        <label class="field"><span class="field-label">Your email</span><input type="email" name="customer_email" required></label>
        ${store.is_physical ? `<label class="field"><span class="field-label">Shipping address</span><textarea name="shipping_address" rows="3" required></textarea></label>` : ""}
        ${picker}
        <label class="chip-radio agree-row">
          <input type="checkbox" name="agree_terms" required>
          I agree to the <a href="#/terms" target="_blank">Buyer Terms</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>. I understand ${escapeHtml(store.business_name)} is an independent seller, not Peltier Development.
        </label>
        <button class="btn btn-accent full" type="submit">Place order</button>
      </form>
    </section>
  `;

  qs("#checkoutForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const items = qsa('[data-product-id]', e.target)
      .map((el) => ({ product_id: parseInt(el.dataset.productId, 10), qty: parseInt(el.value, 10) || 0 }))
      .filter((it) => it.qty > 0);
    try {
      const data = await apiFetch(`/api/stores/${params.subdomain}/checkout`, {
        method: "POST",
        json: {
          items, customer_name: fd.get("customer_name"), customer_email: fd.get("customer_email"),
          shipping_address: fd.get("shipping_address") || "", agree_terms: fd.get("agree_terms") === "on",
          payment_method: fd.get("payment_method") || "",
        },
      });
      location.hash = `#/store/${params.subdomain}/order/${data.order_id}/pay`;
    } catch (err) {
      if (err.data && err.data.code === "plan_limit") {
        app.innerHTML = `<section class="funnel-step">
          <h1>Sorry — this shop can't take new orders right now.</h1>
          <p class="lede">${escapeHtml(store.business_name)} has reached its plan's sales limit for this month (${money(err.data.used_cents)} of ${err.data.cap_cents !== null ? money(err.data.cap_cents) : "∞"}). It'll reopen once the seller upgrades their plan, or automatically next calendar month.</p>
          <a class="btn btn-ghost full" href="#/store/${params.subdomain}">&larr; Back to the shop</a>
        </section>`;
      } else {
        flash(err.message, true);
      }
    }
  });
});

route("/store/:subdomain/order/:orderId/pay", async (params, app) => {
  const url = `/api/stores/${params.subdomain}/orders/${params.orderId}`;
  const d = await apiFetch(url);
  if (d.order.paid) { location.hash = `#/store/${params.subdomain}/order/${params.orderId}`; return; }
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
      onPaid: () => { location.hash = `#/store/${params.subdomain}/order/${params.orderId}`; },
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
        if (ok) { location.hash = `#/store/${params.subdomain}/order/${params.orderId}`; }
        else { qs("#payStatus").hidden = true; qs("#payError").hidden = false; qs("#payError").textContent = error || "Payment didn't go through."; }
      },
    });
  });
});

route("/store/:subdomain/order/:orderId", async (params, app) => {
  const d = await apiFetch(`/api/stores/${params.subdomain}/orders/${params.orderId}`);
  const o = d.order;
  app.innerHTML = `
    <section class="funnel-step">
      <h1>Order #${o.id}</h1>
      <p class="badge badge-${o.paid ? o.status : "awaiting_payment"}">${o.paid ? o.status : "unpaid"}</p>
      <ul>${o.items.map((it) => `<li>${it.qty}× ${escapeHtml(it.name)} — ${money(it.price_cents * it.qty)}</li>`).join("")}</ul>
      <p class="mono">Total: ${money(o.total_cents)}</p>
      ${o.tracking_number ? `<p class="muted">Tracking: ${escapeHtml(o.tracking_carrier || "")} ${escapeHtml(o.tracking_number)}</p>` : ""}
      ${!o.paid ? `<a class="btn btn-primary" href="#/store/${params.subdomain}/order/${params.orderId}/pay">Pay now</a>` : ""}
      <p><a class="mono" href="#/store/${params.subdomain}">&larr; Back to shop</a></p>
    </section>
  `;
});

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

renderRoute();
updateNav();
