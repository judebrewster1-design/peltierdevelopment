(() => {
  "use strict";

  const state = {
    domain: "",
    tld: "",
    years: null,
    pricing: null,   // { price_year1, price_renewal, currency, tld }
    needs: "",
    style: null,
    photos: [],       // File objects
    inclusions: "",
    notes: "",
    email: "",
  };

  const BUILD_FEE = 15;
  let currentStep = 1;
  const TOTAL_STEPS = 6;

  const $ = (sel) => document.querySelector(sel);
  const steps = document.querySelectorAll(".step");
  const stageItems = document.querySelectorAll(".stage");

  function showStep(n) {
    steps.forEach((s) => {
      s.hidden = Number(s.dataset.step) !== n;
    });
    stageItems.forEach((s) => {
      const step = Number(s.dataset.step);
      s.classList.remove("active", "complete");
      if (step === n) s.classList.add("active");
      else if (step < n) s.classList.add("complete");
    });
    currentStep = n;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => showStep(Number(btn.dataset.back)));
  });

  // ---------- Step 1: Domain ----------
  const domainInput = $("#domainInput");
  const domainHint = $("#domainHint");
  const step1Continue = $("#step1Continue");

  function extractTld(domain) {
    const parts = domain.toLowerCase().split(".").filter(Boolean);
    if (parts.length < 2) return null;
    // try longest compound suffix first (e.g. co.uk) down to the last label
    for (let i = 1; i < parts.length; i++) {
      const candidate = parts.slice(i).join(".");
      if (candidate) return candidate;
    }
    return parts[parts.length - 1];
  }

  function isValidDomain(domain) {
    return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain);
  }

  domainInput.addEventListener("input", () => {
    const val = domainInput.value.trim();
    if (!val) {
      domainHint.textContent = "\u00A0";
      domainHint.className = "hint";
      step1Continue.disabled = true;
      return;
    }
    if (!isValidDomain(val)) {
      domainHint.textContent = "That doesn't look like a full domain yet (e.g. yourbusiness.com).";
      domainHint.className = "hint error";
      step1Continue.disabled = true;
      return;
    }
    domainHint.textContent = "Looks good.";
    domainHint.className = "hint ok";
    step1Continue.disabled = false;
  });

  step1Continue.addEventListener("click", async () => {
    state.domain = domainInput.value.trim().toLowerCase();
    state.tld = extractTld(state.domain);
    step1Continue.disabled = true;
    step1Continue.textContent = "Checking price…";
    await fetchPricing(state.tld);
    step1Continue.textContent = "Continue";
    step1Continue.disabled = false;
    showStep(2);
  });

  async function fetchPricing(tld) {
    try {
      const res = await fetch(`${CONFIG.API_BASE}/api/domain-price?tld=${encodeURIComponent(tld)}`);
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      if (data.found) {
        state.pricing = data;
      } else {
        state.pricing = null;
      }
    } catch (err) {
      state.pricing = null;
    }
  }

  // ---------- Step 2: Term ----------
  const termChips = document.querySelectorAll("#termChips .chip");
  const step2Continue = $("#step2Continue");

  termChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      termChips.forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      state.years = Number(chip.dataset.years);
      step2Continue.disabled = false;
    });
  });

  step2Continue.addEventListener("click", () => showStep(3));

  // ---------- Step 3: Blueprint ----------
  const needsInput = $("#needsInput");
  const step3Continue = $("#step3Continue");
  const styleChips = document.querySelectorAll("#styleChips .chip");

  needsInput.addEventListener("input", () => {
    state.needs = needsInput.value.trim();
    step3Continue.disabled = state.needs.length < 8;
  });

  styleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const already = chip.classList.contains("selected");
      styleChips.forEach((c) => c.classList.remove("selected"));
      if (!already) {
        chip.classList.add("selected");
        state.style = chip.dataset.style;
      } else {
        state.style = null;
      }
    });
  });

  step3Continue.addEventListener("click", () => showStep(4));

  // ---------- Step 4: Materials ----------
  const photoInput = $("#photoInput");
  const thumbRow = $("#thumbRow");
  const inclusionsInput = $("#inclusionsInput");
  const step4Continue = $("#step4Continue");

  photoInput.addEventListener("change", () => {
    state.photos = Array.from(photoInput.files).slice(0, 8);
    thumbRow.innerHTML = "";
    state.photos.forEach((file) => {
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      thumbRow.appendChild(img);
    });
  });

  inclusionsInput.addEventListener("input", () => {
    state.inclusions = inclusionsInput.value.trim();
  });

  step4Continue.addEventListener("click", () => {
    renderLedger();
    showStep(5);
  });

  // ---------- Step 5: Estimate ----------
  const ledger = $("#ledger");
  const step5Continue = $("#step5Continue");

  function money(n) {
    return `$${n.toFixed(2)}`;
  }

  function renderLedger() {
    ledger.innerHTML = "";
    const existingNote = ledger.parentElement.querySelector(".ledger-note");
    if (existingNote) existingNote.remove();
    const rows = [];

    if (state.pricing) {
      const yr1 = state.pricing.price_year1;
      const renewal = state.pricing.price_renewal ?? yr1;
      const years = state.years || 1;
      const domainTotal = yr1 + renewal * (years - 1);

      rows.push([`${state.domain} — 1st year`, money(yr1)]);
      if (years > 1) {
        rows.push([`Renewals (${years - 1} × ${money(renewal)}/yr)`, money(renewal * (years - 1))]);
      }
      rows.push([`Domain subtotal (${years} yr${years > 1 ? "s" : ""})`, money(domainTotal), "subtotal"]);
      rows.push(["Build fee", money(BUILD_FEE)]);
      rows.push(["Estimated total", money(domainTotal + BUILD_FEE), "total"]);
    } else {
      rows.push([`Domain (.${state.tld})`, "Priced by hand — we'll confirm"]);
      rows.push(["Build fee", money(BUILD_FEE)]);
      rows.push(["Estimated total", `${money(BUILD_FEE)} + domain`, "total"]);
    }

    rows.forEach(([label, value, kind]) => {
      const row = document.createElement("div");
      row.className = "ledger-row" + (kind === "total" ? " total" : "");
      row.innerHTML = `<span class="label">${label}</span><span>${value}</span>`;
      ledger.appendChild(row);
    });

    const note = document.createElement("p");
    note.className = "ledger-note";
    note.textContent = state.pricing
      ? "Domain pricing reflects current registrar rates and can shift slightly before checkout. The build fee is fixed."
      : "We couldn't reach live registrar pricing just now — the domain cost will be confirmed by hand in your quote reply.";
    ledger.insertAdjacentElement("afterend", note);
  }

  step5Continue.addEventListener("click", () => showStep(6));

  // ---------- Step 6: Send it ----------
  const notesInput = $("#notesInput");
  const emailInput = $("#emailInput");
  const submitBtn = $("#submitBtn");
  const submitHint = $("#submitHint");

  notesInput.addEventListener("input", () => (state.notes = notesInput.value.trim()));

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  submitBtn.addEventListener("click", async () => {
    state.email = emailInput.value.trim();
    if (!isValidEmail(state.email)) {
      submitHint.textContent = "Enter a valid email so we can send your quote back.";
      submitHint.className = "hint error";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    submitHint.textContent = "\u00A0";
    submitHint.className = "hint";

    const form = new FormData();
    form.append("domain", state.domain);
    form.append("years", state.years ?? "");
    form.append("needs", state.needs);
    form.append("style", state.style ?? "");
    form.append("inclusions", state.inclusions);
    form.append("notes", state.notes);
    form.append("email", state.email);
    if (state.pricing) {
      form.append("domain_price_year1", state.pricing.price_year1);
      form.append("domain_price_renewal", state.pricing.price_renewal ?? "");
    }
    form.append("build_fee", BUILD_FEE);
    state.photos.forEach((file, i) => form.append(`photo_${i}`, file, file.name));

    try {
      const res = await fetch(`${CONFIG.API_BASE}/api/quote`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("submit failed");
      const data = await res.json();
      $("#confirmText").textContent =
        `We've got it — a proper quote for ${state.domain} will land at ${state.email} shortly.`;
      const refBox = $("#refBox");
      refBox.innerHTML = `<div class="ledger-row"><span class="label">Reference</span><span>${data.id || "—"}</span></div>`;
      showStep(7);
    } catch (err) {
      submitHint.textContent = "Couldn't reach the server — check your connection and try again.";
      submitHint.className = "hint error";
      submitBtn.disabled = false;
      submitBtn.textContent = "Send request";
    }
  });

  // ---------- Ad slot ----------
  function initAdSlot() {
    const adBody = $("#adBody");
    const client = CONFIG.ADSENSE_CLIENT || "";
    const slot = CONFIG.ADSENSE_SLOT || "";

    if (!client.includes("0000000000000000") && client.startsWith("ca-pub-")) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);

      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.style.width = "300px";
      ins.style.height = "90px";
      ins.setAttribute("data-ad-client", client);
      ins.setAttribute("data-ad-slot", slot);
      adBody.appendChild(ins);

      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } else {
      adBody.innerHTML = `<div class="ad-placeholder">Ad slot — add your AdSense client &amp; slot ID in config.js</div>`;
    }
  }

  $("#adClose").addEventListener("click", () => {
    $("#adSlot").remove();
  });

  initAdSlot();
  if (String(CONFIG.API_BASE || "").includes("REPLACE-WITH")) {
    const banner = document.getElementById("setupBanner");
    if (banner) banner.hidden = false;
  }
  showStep(1);
})();
