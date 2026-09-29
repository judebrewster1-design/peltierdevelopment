const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  const dom = new JSDOM(html, {
    url: "http://localhost:8080/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // jsdom doesn't implement fetch - use Node's built-in fetch (Node 22 has it globally)
  window.fetch = fetch;
  window.location.hostname = "localhost"; // matches API_BASE's localhost branch

  // jsdom's own window.FormData is a different class from Node's global FormData
  // that undici's fetch expects as a body - passing one to the other silently
  // fails. Real browsers only ever have one FormData implementation, so this is
  // purely a Node/jsdom test-tooling gap, not something app.js's code needs to
  // work around. Patched here, for the test only, so multipart submissions
  // (product photos, banner/logo uploads) get real end-to-end coverage instead
  // of being skipped.
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

  // Suppress noisy "Not implemented: HTMLFormElement.prototype.submit" etc.
  window.onerror = (msg) => console.error("window.onerror:", msg);

  const scriptEl = window.document.createElement("script");
  scriptEl.textContent = appJs;
  window.document.body.appendChild(scriptEl);

  await sleep(300);

  const results = [];
  function check(name, cond, extra) {
    results.push({ name, pass: !!cond, extra });
    console.log((cond ? "PASS" : "FAIL") + " - " + name + (extra ? ` (${extra})` : ""));
  }

  // ---- Home page renders ----
  check("home page shows hero heading", window.document.querySelector(".hero h1") && window.document.querySelector(".hero h1").textContent.includes("Sell online"));
  check("home page shows plan cards", window.document.querySelectorAll(".plan-card").length === 3, `found ${window.document.querySelectorAll(".plan-card").length}`);

  // ---- Navigate to /create ----
  window.location.hash = "#/create";
  await sleep(200);
  check("create page shows subdomain input", !!window.document.querySelector("#subdomainInput"));

  // Type a subdomain and wait for the debounced availability check
  const input = window.document.querySelector("#subdomainInput");
  // Letters only, matching the app's own subdomain rule (a-z, no digits) - a
  // random letters-only suffix keeps this unique across repeated runs without
  // tripping the same "digits get stripped" behavior real users would hit too.
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const suffix = Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * 26)]).join("");
  const uniqueName = "jsdomtest" + suffix;
  input.value = uniqueName;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(700);
  const resultText = window.document.querySelector("#subdomainResult").textContent;
  check("subdomain availability check ran", resultText.includes("available"), resultText);
  const continueBtn = window.document.querySelector("#continueBtn");
  check("continue button enabled after valid+available check", !continueBtn.disabled);

  continueBtn.click();
  await sleep(200);
  check("navigated to signup form", window.location.hash.startsWith("#/create/signup"));
  const signupH1 = window.document.querySelector("h1") ? window.document.querySelector("h1").textContent : "(no h1 found)";
  check("signup form shows the chosen subdomain", signupH1.includes(uniqueName), `h1 was: "${signupH1}"`);

  // Fill and submit signup
  const form = window.document.querySelector("#signupForm");
  form.querySelector('[name="email"]').value = uniqueName + "@test.com";
  form.querySelector('[name="password"]').value = "testpass123";
  form.querySelector('[name="is_physical"][value="no"]').checked = true;
  form.querySelector('[name="agree_terms"]').checked = true;
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(400);
  check("signup succeeded, landed on /pay", window.location.hash === "#/pay", window.location.hash);
  check("store token stored", !!window.localStorage.getItem("pelt_store_token"));

  // ---- Dashboard should redirect to /pay since setup fee unpaid (already there) ----
  await sleep(400);
  check("pay page shows setup fee amount + e-transfer instructions", window.document.body.textContent.includes("$25.00") && window.document.body.textContent.includes("platform@example.com"));

  // Mark setup_paid the same way every other test in this project does - bypassing
  // the real Helcim iframe, which can't be driven headlessly - then confirm the
  // rest of the seller-facing app (products, orders, customize, plan, checkout,
  // and the owner portal) all actually work once the store is live.
  const { execSync } = require("child_process");
  const dbPath = path.join(__dirname, "..", "backend", "peltdev.db");
  execSync(`python3 -c "import sqlite3; c=sqlite3.connect('${dbPath}'); c.execute(\\"UPDATE stores SET setup_paid=1 WHERE subdomain='${uniqueName}'\\"); c.commit()"`);

  window.location.hash = "#/admin";
  await sleep(400);
  check("dashboard loads once setup fee is marked paid", window.document.body.textContent.includes(uniqueName) || window.location.hash === "#/admin", window.location.hash);
  check("dashboard shows product count stat", window.document.querySelectorAll(".stat-card").length >= 3);

  // ---- Products ----
  window.location.hash = "#/admin/products";
  await sleep(300);
  const prodForm = window.document.querySelector("#productForm");
  check("product form present", !!prodForm);
  prodForm.querySelector('[name="name"]').value = "Jsdom Widget";
  prodForm.querySelector('[name="price"]').value = "19.99";
  prodForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(800);
  check("product appears in list after adding", window.document.querySelector("#productList").textContent.includes("Jsdom Widget"));
  check("product shows correct price", window.document.querySelector("#productList").textContent.includes("$19.99"));

  // ---- Payments page: both methods, fee boxes ----
  window.location.hash = "#/admin/payment-settings";
  await sleep(600);
  const pbody = () => window.document.body.textContent;
  check("payments page shows PayPal fee box (2.9% + $0.30)", pbody().includes("2.9% + $0.30"));
  check("payments page shows e-transfer $0 box", pbody().includes("$0 in fees from us"));
  window.document.querySelector("#tryPrice").value = "37";
  window.document.querySelector("#tryPrice").dispatchEvent(new window.Event("input", { bubbles: true }));
  check("fee calculator: PayPal fee on $37.00 is $1.37", window.document.querySelector("#tryPP").textContent === "$1.37", window.document.querySelector("#tryPP").textContent);
  window.document.querySelector("#ppCheck").click();
  window.document.querySelector("#etCheck").click();
  window.document.querySelector("#ppMe").value = "jsdomshop";
  window.document.querySelector("#ppEmail").value = "seller-pp@jsdomtest.com";
  window.document.querySelector("#etEmail").value = "seller@jsdomtest.com";
  window.document.querySelector("#saveMethods").click();
  await sleep(800);
  check("payments saved (both methods on)", window.document.querySelector("#ppCheck").checked && window.document.querySelector("#etCheck").checked);
  window.document.querySelector("#emailTestRaw").value = "From: someone@evil.com\nSubject: hi\n\nPay me $15.00";
  window.document.querySelector("#emailTestBtn").click();
  await sleep(600);
  check("email test tool explains a bad email", window.document.querySelector("#emailTestOut").textContent.includes("would NOT pay"), window.document.querySelector("#emailTestOut").textContent.slice(0, 80));

  // ---- Customize ----
  window.location.hash = "#/admin/customize";
  await sleep(400);
  check("customize page shows live preview", !!window.document.querySelector("#previewFrame"));
  const taglineInput = window.document.querySelector("#taglineInput");
  taglineInput.value = "Fresh from jsdom";
  taglineInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(50);
  check("live preview updates tagline instantly", window.document.querySelector("#pvTagline").textContent === "Fresh from jsdom");
  window.document.querySelector("#customizeForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(400);

  // ---- Plan page ----
  window.location.hash = "#/admin/plan";
  await sleep(400);
  check("plan page shows Starter as current", window.document.body.textContent.includes("Starter"));
  check("plan page shows all three plan cards", window.document.querySelectorAll(".plan-card").length === 3);

  // ---- Public storefront reflects the customization we just saved ----
  window.location.hash = `#/${uniqueName}`;
  await sleep(400);
  check("public storefront shows the tagline we saved", window.document.body.textContent.includes("Fresh from jsdom"));
  check("public storefront lists the product", window.document.body.textContent.includes("Jsdom Widget"));

  // ---- Checkout flow (order creation, no real Helcim payment) ----
  window.location.hash = `#/${uniqueName}/checkout`;
  await sleep(400);
  const qtyInput = window.document.querySelector("[data-product-id]");
  check("checkout page shows a quantity input for the product", !!qtyInput);
  qtyInput.value = "2";
  window.document.querySelector('[name="customer_email"]').value = "buyer@jsdomtest.com";
  window.document.querySelector('[name="agree_terms"]').checked = true;
  check("checkout offers a payment-method picker", window.document.querySelectorAll('[name="payment_method"]').length === 2);
  window.document.querySelector('[name="payment_method"][value="paypal"]').checked = true;
  window.document.querySelector("#checkoutForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(400);
  check("checkout created an order and navigated to its pay page", /#\/[a-z]+\/order\/\d+\/pay/.test(window.location.hash), window.location.hash);
  await sleep(600);
  const ppLink = window.document.querySelector('a[href*="paypal.me"]');
  check("pay page shows PayPal button with exact amount filled in", ppLink && ppLink.href.includes("jsdomshop/39.98CAD"), ppLink && ppLink.href);
  check("pay page tells buyer the exact amount", window.document.body.textContent.includes("$39.98"));

  // ---- Owner portal ----
  window.localStorage.removeItem("pelt_store_token"); // simulate a fresh browser for the owner login
  window.location.hash = "#/owner/login";
  await sleep(300);
  const ownerForm = window.document.querySelector("#ownerLoginForm");
  check("owner login form present", !!ownerForm);
  ownerForm.querySelector('[name="password"]').value = process.env.TEST_OWNER_PASSWORD || "";
  ownerForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(400);
  check("owner login succeeded, landed on overview", window.location.hash === "#/owner", window.location.hash);
  check("owner overview lists our test store", window.document.body.textContent.includes(uniqueName));
  check("owner overview shows top sellers section", window.document.body.textContent.includes("Top sellers"));

  const storeLink = Array.from(window.document.querySelectorAll("a")).find((a) => a.getAttribute("href") && a.getAttribute("href").startsWith("#/owner/store/"));
  check("owner overview links to the store detail page", !!storeLink);
  if (storeLink) {
    window.location.hash = storeLink.getAttribute("href");
    await sleep(400);
    check("owner store detail loads", window.document.body.textContent.includes(uniqueName) || window.document.body.textContent.includes("Jsdom Widget"));
    const compBtn = window.document.querySelector("#compBtn");
    check("owner store detail shows a comp button", !!compBtn);
    if (compBtn) {
      compBtn.click();
      await sleep(400);
      check("comping the store shows Gifted badge", window.document.body.textContent.includes("Gifted"));
    }
  }

  window.location.hash = "#/owner/security";
  await sleep(400);
  check("owner security page loads with activity log", window.document.body.textContent.includes("Recent activity"));

  global.__testResults = results;
  global.__testUniqueName = uniqueName;
}

run().then(() => {
  const failed = global.__testResults.filter((r) => !r.pass && r.name !== "__NEEDS_DB_WRITE__");
  console.log(`\n${global.__testResults.length - 1} checks run, ${failed.length} failed.`);
  console.log("UNIQUE_NAME=" + global.__testUniqueName);
  process.exit(failed.length ? 1 : 0);
}).catch((err) => {
  console.error("Test harness crashed:", err);
  process.exit(1);
});
