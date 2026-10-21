/**
 * Demo mode: an in-browser stand-in for the Flask API.
 *
 * WHY: when the real backend is offline (tunnel down, laptop asleep) the site
 * would otherwise just say "couldn't reach the server". Instead app.js flips to
 * this module, shows a small "Backend offline" chip, and lets anyone click
 * through the WHOLE product with sample data: create a store, pay the setup
 * fee, set up payments, add products, customize, shop the storefront, check
 * out, and even the owner portal. Everything lives in this browser's
 * localStorage. Nothing is sent anywhere, no money moves, and the moment the
 * real backend answers again app.js switches back and this module goes quiet.
 *
 * Response shapes were captured from the real backend, so every screen renders
 * exactly as it would live.
 */
const DemoAPI = (() => {
  const META = {"accent_styles":[{"key":"rounded","label":"Rounded \u2014 soft corners"},{"key":"sharp","label":"Sharp \u2014 square corners"}],"banner_styles":[{"key":"image","label":"Photo \u2014 your own uploaded banner"},{"key":"gradient","label":"Gradient \u2014 built from your accent color, no photo needed"},{"key":"solid","label":"Solid \u2014 flat accent-colored band"}],"button_styles":[{"key":"solid","label":"Solid \u2014 filled accent, softly rounded"},{"key":"pill","label":"Pill \u2014 fully rounded, friendly"},{"key":"outline","label":"Outline \u2014 accent border, no fill"},{"key":"block","label":"Block \u2014 square, bold, uppercase"}],"card_styles":[{"key":"shadow","label":"Shadow \u2014 soft lift off the page"},{"key":"flat","label":"Flat \u2014 minimal, no depth"},{"key":"outline","label":"Outline \u2014 bordered, no fill"}],"demo_video_id":"","font_pairings":{"bold":{"body":"'Work Sans', system-ui, sans-serif","gfonts":"Archivo+Black&family=Work+Sans:wght@400;500;600","heading":"'Archivo Black', sans-serif","label":"Bold (Archivo Black / Work Sans)"},"editorial":{"body":"'Inter', system-ui, sans-serif","gfonts":"Playfair+Display:wght@600;700&family=Inter:wght@400;500;600","heading":"'Playfair Display', serif","label":"Editorial (Playfair Display / Inter)"},"elegant":{"body":"'Jost', system-ui, sans-serif","gfonts":"Cormorant+Garamond:wght@600;700&family=Jost:wght@400;500","heading":"'Cormorant Garamond', serif","label":"Elegant (Cormorant Garamond / Jost)"},"friendly":{"body":"'Nunito Sans', system-ui, sans-serif","gfonts":"Poppins:wght@600;700&family=Nunito+Sans:wght@400;600","heading":"'Poppins', sans-serif","label":"Friendly (Poppins / Nunito Sans)"},"signature":{"body":"'IBM Plex Sans', system-ui, sans-serif","gfonts":"Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600","heading":"'Space Grotesk', sans-serif","label":"Signature (Space Grotesk / IBM Plex Sans)"},"technical":{"body":"'Roboto', system-ui, sans-serif","gfonts":"Chivo+Mono:wght@500;600&family=Roboto:wght@400;500","heading":"'Chivo Mono', monospace","label":"Technical (Chivo Mono / Roboto)"}},"is_cut_off":false,"layout_styles":[{"key":"grid","label":"Grid \u2014 a browsable product wall"},{"key":"list","label":"List \u2014 one item per row, more detail up front"}],"page_looks":[{"bg":"#0A0E14","border":"#232A3A","key":"dark","label":"Dark \u2014 deep navy, glowing accents","muted":"#8A94A6","surface":"#12161F","surface2":"#1A2030","text":"#E8ECF1"},{"bg":"#FFFFFF","border":"#DDE1E8","key":"light","label":"Light \u2014 crisp white, clean and modern","muted":"#566074","surface":"#F6F7F9","surface2":"#ECEEF2","text":"#11141A"},{"bg":"#FBF6EC","border":"#E3D8C2","key":"cream","label":"Cream \u2014 warm paper, handmade feel","muted":"#705F4C","surface":"#FFFDF8","surface2":"#F1E8D6","text":"#2B2118"},{"bg":"#F2F5FA","border":"#D8DFEB","key":"mist","label":"Mist \u2014 cool pale blue-grey, airy","muted":"#566177","surface":"#FFFFFF","surface2":"#E6EBF3","text":"#141B2B"},{"bg":"#0B0B0C","border":"#2E2C28","key":"noir","label":"Noir \u2014 true black with warm ivory text","muted":"#A39B8A","surface":"#151516","surface2":"#202022","text":"#F4EFE4"}],"plan_order":["starter","growth","scale"],"plans":{"growth":{"cap_cents":1000000,"fee_credit_cap_cents":2000,"key":"growth","kind":"flat","label":"Growth","price_dollars":35.0,"tagline":"$35/mo \u2014 up to $10,000 in sales per month, and we cover up to $20/mo of your own Helcim processing fees."},"scale":{"cap_cents":null,"key":"scale","kind":"usage","label":"Scale","percent":0.01,"price_dollars":49.0,"tagline":"1% of what you sell, $49/mo minimum \u2014 unlimited, no matter how many transactions."},"starter":{"cap_cents":250000,"key":"starter","kind":"flat","label":"Starter","price_dollars":0.0,"tagline":"Free \u2014 up to $2,500 in sales per calendar month."}},"root_domain":"peltdev.com","setup_fee_dollars":25.0,"ship_to_options":[{"countries":["CA"],"key":"ca","label":"Canada only"},{"countries":["CA","US"],"key":"ca_us","label":"Canada & United States"},{"countries":null,"key":"worldwide","label":"Worldwide"}],"site_cutoff":"June 30, 2027","theme_presets":[{"hex":"#E31C3D","name":"Signature red"},{"hex":"#1C7DE0","name":"Ocean"},{"hex":"#1F9D55","name":"Forest"},{"hex":"#E8A93F","name":"Amber"},{"hex":"#8B5CF6","name":"Violet"},{"hex":"#64748B","name":"Slate"},{"hex":"#14B8A6","name":"Teal"},{"hex":"#EC4899","name":"Magenta"},{"hex":"#4F46E5","name":"Indigo"}],"themes":[{"accent_style":"sharp","banner_style":"solid","blurb":"Stark white, electric orange, heavy type. Loud and confident.","button_style":"block","card_style":"outline","font_choice":"bold","key":"bold-modern","layout_style":"grid","name":"Bold Modern","page_look":"light","theme_color":"#FF4A1C"},{"accent_style":"sharp","banner_style":"gradient","blurb":"Dark, techy and compact. Great for gadgets and gaming.","button_style":"outline","card_style":"outline","font_choice":"technical","key":"midnight-market","layout_style":"list","name":"Midnight Market","page_look":"dark","theme_color":"#8B5CF6"},{"accent_style":"rounded","banner_style":"gradient","blurb":"Warm and welcoming. Made for crafts, bakes and art.","button_style":"pill","card_style":"shadow","font_choice":"friendly","key":"sunset-studio","layout_style":"grid","name":"Sunset Studio","page_look":"cream","theme_color":"#E8892B"},{"accent_style":"sharp","banner_style":"solid","blurb":"Quiet, editorial, all business. Lets the products talk.","button_style":"solid","card_style":"flat","font_choice":"technical","key":"minimal-mono","layout_style":"list","name":"Minimal Mono","page_look":"light","theme_color":"#2B3140"},{"accent_style":"rounded","banner_style":"gradient","blurb":"Soft greens on paper. Plants, wellness, natural goods.","button_style":"pill","card_style":"shadow","font_choice":"editorial","key":"botanical","layout_style":"grid","name":"Botanical","page_look":"cream","theme_color":"#2F8F5B"},{"accent_style":"sharp","banner_style":"gradient","blurb":"Hot pink on black. Streetwear, music and nightlife.","button_style":"block","card_style":"outline","font_choice":"bold","key":"neon-nights","layout_style":"grid","name":"Neon Nights","page_look":"noir","theme_color":"#FF2E93"},{"accent_style":"rounded","banner_style":"gradient","blurb":"Fresh and friendly blue. Easy for any small shop.","button_style":"solid","card_style":"shadow","font_choice":"friendly","key":"ocean-breeze","layout_style":"grid","name":"Ocean Breeze","page_look":"mist","theme_color":"#1C7DE0"},{"accent_style":"sharp","banner_style":"solid","blurb":"Black and gold with a serif voice. Jewellery and premium goods.","button_style":"outline","card_style":"flat","font_choice":"elegant","key":"luxe-noir","layout_style":"grid","name":"Luxe Noir","page_look":"noir","theme_color":"#C9A24A"},{"accent_style":"rounded","banner_style":"gradient","blurb":"Magazine layout, deep indigo. Prints, books and stationery.","button_style":"solid","card_style":"flat","font_choice":"editorial","key":"indigo-editorial","layout_style":"list","name":"Indigo Editorial","page_look":"mist","theme_color":"#4F46E5"}]};
  const KEY = "pelt_demo_db_v1";
  const ROOT = META.root_domain || "peltdev.com";
  const RESERVED = new Set(["www", "app", "api", "admin", "owner", "story", "terms", "privacy", "support", "create", "login", "logout", "pay", "checkout", "order", "mail", "help"]);
  const TAKEN = new Set(["shop", "store", "test", "demo", "peltier"]);

  // ------------------------------------------------------------ helpers
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const daysAgo = (n, h = 12) => stamp(new Date(Date.now() - n * 864e5 - (12 - h) * 36e5));
  const rid = (n = 6) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  const fail = (status, message, extra) => { const e = new Error(message); e.status = status; e.data = Object.assign({ error: message }, extra || {}); throw e; };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function art(c1, c2, shape) {
    const g = { circle: '<circle cx="200" cy="200" r="90" fill="#fff" fill-opacity=".85"/>', diamond: '<path d="M200 90l110 110-110 110-110-110z" fill="#fff" fill-opacity=".85"/>', bars: '<g fill="#fff" fill-opacity=".85"><rect x="110" y="120" width="40" height="170" rx="8"/><rect x="180" y="90" width="40" height="200" rx="8"/><rect x="250" y="150" width="40" height="140" rx="8"/></g>', ring: '<circle cx="200" cy="200" r="85" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="26"/>' }[shape || "circle"];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/>${g}</svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }
  function banner(c1, c2) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1200" height="360" fill="url(#g)"/><circle cx="1010" cy="70" r="190" fill="#fff" fill-opacity=".1"/><circle cx="160" cy="330" r="150" fill="#000" fill-opacity=".12"/></svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  // ------------------------------------------------------------ database
  const STORE_DEFAULTS = {
    about_text: null, accent_style: "rounded", announcement: null, banner_image: null, banner_style: "image", button_style: "solid",
    card_style: "shadow", etransfer_discount_pct: 0, etransfer_email: null, font_choice: "signature", footer_note: null, grid_columns: 2,
    hero_align: "left", is_physical: true, layout_style: "grid", logo_image: null, order_button_text: null, page_look: "dark",
    paypal_email: null, paypal_me: null, plan: "starter", plan_renews_at: null, plan_started_at: null, setup_paid: false,
    shipping_flat_cents: 0, ships_to: "ca", social_instagram: null, social_website: null, suspended: false, suspended_reason: null,
    tagline: null, theme_color: "#E31C3D", helcim_account_id: null, email: { configured: false, imap_host: null, imap_user: null, last_checked_at: null, last_error: null },
  };

  function seed() {
    const themeBy = (k) => META.themes.find((t) => t.key === k) || META.themes[0];
    const mk = (id, over, themeKey) => Object.assign({}, STORE_DEFAULTS, themeBy(themeKey) && (() => { const t = themeBy(themeKey); return { theme_color: t.theme_color, font_choice: t.font_choice, layout_style: t.layout_style, accent_style: t.accent_style, banner_style: t.banner_style, card_style: t.card_style, page_look: t.page_look, button_style: t.button_style }; })(), { id, created_at: daysAgo(30 - id * 6), setup_paid: true, demo_seed: true }, over);
    const db = { v: 1, nextId: { store: 4, product: 20, order: 40, msg: 3, pp: 2 }, tokens: {}, stores: [], products: [], orders: [], platformPayments: [], support: [], audit: [] };
    db.stores.push(mk(1, { subdomain: "wildthread", business_name: "Wild Thread Co.", owner_email: "demo@wildthread.co", password: "*", tagline: "Handmade bracelets, scarves and totes", about_text: "A tiny studio making things you will keep for years. Every piece is dyed, woven and packed by hand.", etransfer_email: "pay@wildthread.co", paypal_me: "wildthread", etransfer_discount_pct: 3, announcement: "Free local pickup this weekend", order_button_text: "Shop now", grid_columns: 3, hero_align: "center", footer_note: "Returns within 14 days. Questions? Message us on Instagram.", social_instagram: "@wildthread", shipping_flat_cents: 600, plan: "starter", banner_image: banner("#FF4A1C", "#B8260A"), email: { configured: true, imap_host: "imap.gmail.com", imap_user: "wildthread.pay@gmail.com", last_checked_at: daysAgo(0, 11), last_error: null } }, "bold-modern"));
    db.stores.push(mk(2, { subdomain: "northerncandle", business_name: "Northern Candle Works", owner_email: "hello@northerncandle.ca", password: "*", tagline: "Hand-poured soy candles", about_text: "Small-batch candles poured in Nova Scotia with cotton wicks and cedar, sea salt and balsam scents.", etransfer_email: "pay@northerncandle.ca", plan: "growth", plan_started_at: daysAgo(10), plan_renews_at: stamp(new Date(Date.now() + 20 * 864e5)), banner_image: banner("#2F8F5B", "#1B5E3A"), shipping_flat_cents: 800 }, "botanical"));
    db.stores.push(mk(3, { subdomain: "pixelpantry", business_name: "Pixel Pantry", owner_email: "dev@pixelpantry.io", password: "*", is_physical: false, tagline: "Digital asset packs for game makers", about_text: "Icon sets, tilesets and UI kits with a commercial licence.", paypal_me: "pixelpantry", banner_image: banner("#FF2E93", "#7A1148") }, "neon-nights"));
    const P = (id, store_id, name, price, desc, c1, c2, shape, days) => db.products.push({ id, store_id, name, price_cents: price, description: desc, image_path: art(c1, c2, shape), active: true, created_at: daysAgo(days) });
    P(1, 1, "Hand-dyed scarf", 3200, "Merino blend, dyed in small batches.", "#C97B5A", "#8A4A32", "circle", 28);
    P(2, 1, "Beaded bracelet", 1800, "Glass beads on stretch cord.", "#6B8FB3", "#3F5F85", "ring", 27);
    P(3, 1, "Linen tote", 2600, "Heavy washed linen with an inner pocket.", "#B5A47A", "#7C6C45", "bars", 26);
    P(4, 1, "Woven keychain", 900, "Tiny, colourful, surprisingly sturdy.", "#8AA386", "#4F6D4B", "diamond", 20);
    P(5, 2, "Cedar and sea salt", 2400, "8 oz soy candle, 45 hour burn.", "#2F8F5B", "#164F31", "circle", 22);
    P(6, 2, "Balsam fir", 2400, "A walk in the woods, in a jar.", "#4A7C59", "#25402D", "ring", 21);
    P(7, 2, "Gift set of three", 6200, "Three mini candles in a keepsake box.", "#D4A06A", "#9A6733", "bars", 18);
    P(8, 3, "Dungeon tileset", 1500, "480 tiles, 16x16, commercial licence.", "#FF2E93", "#7A1148", "diamond", 15);
    P(9, 3, "Pixel UI kit", 1200, "Buttons, bars and panels in four themes.", "#8B5CF6", "#4B2F94", "bars", 14);
    P(10, 3, "Icon pack: potions", 800, "120 hand-drawn potion icons.", "#14B8A6", "#0C6D63", "ring", 12);
    const O = (id, store_id, items, ago, paid, status, method, extra) => {
      const sub = items.reduce((s, [pid, q]) => s + db.products.find((p) => p.id === pid).price_cents * q, 0);
      const st = db.stores.find((s) => s.id === store_id);
      const ship = st.is_physical ? st.shipping_flat_cents : 0;
      db.orders.push(Object.assign({ id, store_id, created_at: daysAgo(ago, 9 + (id % 9)), items: items.map(([pid, q]) => { const p = db.products.find((x) => x.id === pid); return { name: p.name, price_cents: p.price_cents, product_id: pid, qty: q }; }), total_cents: sub + ship, shipping_cents: ship, paid, status, payment_method: method, payment_ref: "ORD-" + rid(), etransfer_amount_cents: sub + ship, needs_shipping: !!st.is_physical, tracking_carrier: null, tracking_number: null, tracking_pending: false }, extra || {}));
    };
    O(1, 1, [[1, 1], [2, 2]], 13, true, "shipped", "etransfer", { customer_name: "Avery Chen", customer_email: "avery@example.com", shipping_address: "12 Harbour St\nHalifax NS B3J 1A1\nCanada", tracking_carrier: "Canada Post", tracking_number: "7123456789012" });
    O(2, 1, [[3, 1]], 11, true, "shipped", "paypal", { customer_name: "Jordan Lee", customer_email: "jordan@example.com", shipping_address: "88 Queen St\nToronto ON M5H 2N2\nCanada", tracking_carrier: "Canada Post", tracking_number: "7123456781111" });
    O(3, 1, [[4, 3]], 8, true, "confirmed", "etransfer", { customer_name: "Sam Patel", customer_email: "sam@example.com", shipping_address: "5 Oak Ave\nOttawa ON K1A 0B1\nCanada" });
    O(4, 1, [[1, 2], [3, 1]], 4, true, "paid", "etransfer", { customer_name: "Riley Moore", customer_email: "riley@example.com", shipping_address: "301 Main St\nMoncton NB E1C 1B9\nCanada" });
    O(5, 1, [[2, 1]], 1, false, "awaiting_payment", "etransfer", { customer_name: "Casey Wu", customer_email: "casey@example.com" });
    O(6, 2, [[5, 2]], 9, true, "shipped", "etransfer", { customer_name: "Morgan Ellis", customer_email: "morgan@example.com", shipping_address: "9 Pine Rd\nSydney NS B1P 1A1\nCanada", tracking_carrier: "Canada Post", tracking_number: "7000000000011" });
    O(7, 2, [[7, 1]], 5, true, "paid", "etransfer", { customer_name: "Taylor Brooks", customer_email: "taylor@example.com", shipping_address: "44 Elm St\nHalifax NS B3K 2C4\nCanada" });
    O(8, 2, [[6, 3], [5, 1]], 2, true, "confirmed", "etransfer", { customer_name: "Dana Fox", customer_email: "dana@example.com", shipping_address: "17 Shore Rd\nTruro NS B2N 1A1\nCanada" });
    O(9, 3, [[8, 1], [9, 1]], 6, true, "confirmed", "paypal", { customer_name: "Kai Nakamura", customer_email: "kai@example.com" });
    O(10, 3, [[10, 2]], 3, true, "confirmed", "paypal", { customer_name: "Priya Shah", customer_email: "priya@example.com" });
    db.platformPayments.push({ id: 1, store_id: 3, kind: "setup_fee", method: "etransfer", amount_cents: 2500, ref: "PELT-" + rid(), status: "pending", created_at: daysAgo(0, 8), subdomain: "pixelpantry" });
    db.support.push({ id: 1, email: "avery@example.com", subject: "Where is my order?", message: "Hi! I ordered a scarf and bracelets last week. Do you have a tracking number? Thanks.", store_subdomain: "wildthread", created_at: daysAgo(2) });
    db.support.push({ id: 2, email: "newseller@example.com", subject: "Can I use my own domain?", message: "Love the idea. Is it possible to point my own domain at my store later on?", store_subdomain: "", created_at: daysAgo(1) });
    db.audit.push({ id: 1, action: "login_success", actor_type: "owner", actor_label: "owner", detail: "", ip: "127.0.0.1", created_at: daysAgo(0, 8) });
    db.audit.push({ id: 2, action: "payment_methods_updated", actor_type: "store", actor_label: "demo@wildthread.co", detail: "etransfer_email,paypal_me", ip: "127.0.0.1", created_at: daysAgo(3) });
    return db;
  }

  let DB = null;
  function load() {
    if (DB) return DB;
    try { const raw = localStorage.getItem(KEY); if (raw) DB = JSON.parse(raw); } catch (e) { /* storage blocked */ }
    if (!DB || DB.v !== 1) DB = seed();
    return DB;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* too big or blocked: keep in memory */ } }
  function reset() { DB = seed(); save(); }

  // ------------------------------------------------------------ views of rows
  const PRIVATE_ONLY = ["owner_email", "created_at", "plan", "plan_renews_at", "plan_started_at", "setup_paid", "suspended", "suspended_reason"];
  const INTERNAL = ["password", "email", "helcim_account_id", "demo_seed", "paypal_email"];
  function storeDict(s, priv) {
    const o = clone(s);
    INTERNAL.forEach((k) => delete o[k]);
    if (priv) { o.paypal_email = s.paypal_email || null; return o; }
    PRIVATE_ONLY.forEach((k) => delete o[k]);
    delete o.paypal_email;
    o.helcim_connected = !!s.helcim_account_id;
    return o;
  }
  const productDict = (p) => ({ active: p.active, created_at: p.created_at, description: p.description, id: p.id, image_path: p.image_path, name: p.name, price_cents: p.price_cents });
  function orderDict(o) {
    const d = clone(o);
    delete d.store_id; delete d.pay_at;
    return d;
  }
  const monthStart = () => { const n = new Date(); return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-01 00:00:00`; };
  const planOf = (s) => META.plans[s.plan] || { key: s.plan, kind: "comp", label: s.plan === "comp" ? "Comp" : s.plan, cap_cents: null, price_dollars: 0, tagline: "Gifted by the platform owner." };
  const planPublic = (s) => { const p = clone(planOf(s)); p.key = s.plan; return p; };
  function paidOrders(sid) { return DB.orders.filter((o) => o.store_id === sid && o.paid); }
  function usedCents(sid) { const ms = monthStart(); return paidOrders(sid).filter((o) => o.created_at >= ms).reduce((a, o) => a + o.total_cents, 0); }

  // lazily "receive" simulated payments so waiting screens resolve on their own
  function tick() {
    const now = Date.now(); let dirty = false;
    DB.orders.forEach((o) => { if (!o.paid && o.pay_at && now >= o.pay_at) { o.paid = true; o.status = "paid"; delete o.pay_at; dirty = true; } });
    DB.platformPayments.forEach((p) => { if (p.status === "pending" && p.pay_at && now >= p.pay_at) { applyPlatformPayment(p); dirty = true; } });
    if (dirty) save();
  }
  function applyPlatformPayment(p) {
    p.status = "paid"; delete p.pay_at;
    const s = DB.stores.find((x) => x.id === p.store_id);
    if (!s) return;
    if (p.kind === "setup_fee") s.setup_paid = true;
    if (p.kind === "plan_upgrade" && p.plan_key) { s.plan = p.plan_key; s.plan_started_at = stamp(); s.plan_renews_at = stamp(new Date(Date.now() + 30 * 864e5)); }
  }

  // ------------------------------------------------------------ auth
  function storeFromAuth(auth) {
    const t = Auth.getStoreToken();
    const sid = t && DB.tokens[t];
    // A token minted by a real backend means nothing here: drop it so the
    // person logs into a demo account instead of seeing a broken session.
    const s = sid && DB.stores.find((x) => x.id === sid);
    if (!s) fail(401, "Please log in.");
    if (s.suspended) fail(403, "This store is suspended.");
    return s;
  }
  function mintToken(sid) { const t = "demo-" + rid(24); DB.tokens[t] = sid; return t; }
  const ownerOk = () => { if (Auth.getOwnerToken() !== "demo-owner") fail(401, "Owner login required."); };
  const needPaid = (s) => { if (!s.setup_paid) fail(402, "Pay the setup fee first."); };

  // ------------------------------------------------------------ fields from FormData
  const fget = (form, k) => (form && typeof form.get === "function" ? form.get(k) : null);
  function readFile(file) { return new Promise((res) => { if (!file || !file.size) return res(null); if (file.size > 900 * 1024) return res("TOO_BIG"); const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(file); }); }
  const HEX = /^#[0-9A-Fa-f]{6}$/;

  // ------------------------------------------------------------ charts + owner aggregates
  function chartSvg(orders) {
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5); return stamp(d).slice(0, 10); });
    const vals = days.map((d) => orders.filter((o) => o.paid && o.created_at.slice(0, 10) === d).reduce((a, o) => a + o.total_cents, 0));
    if (!vals.some((v) => v > 0)) return null;
    const max = Math.max(...vals, 1), W = 640, H = 170, bw = W / 14;
    const bars = vals.map((v, i) => { const h = Math.max(3, (v / max) * (H - 40)); return `<rect x="${(i * bw + 6).toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${(bw - 12).toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="#2F6FED" opacity="${v ? 1 : .25}"><title>${days[i]}: $${(v / 100).toFixed(2)}</title></rect><text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 6}" font-size="9" text-anchor="middle" fill="#8A94A6">${days[i].slice(8)}</text>`; }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Revenue, last 14 days">${bars}</svg>`;
  }
  const ownerStoreRow = (s) => Object.assign(storeDict(s, true), { plan_effective: s.plan });

  // ------------------------------------------------------------ router
  const routes = [];
  const on = (method, re, fn) => routes.push({ method, re, fn });

  on("GET", /^\/api\/meta$/, () => clone(META));
  on("POST", /^\/api\/subdomain-check$/, ({ json }) => {
    const cleaned = String((json && json.name) || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!cleaned) return { valid: false, error: "Letters a-z only." };
    if (cleaned.length < 3) return { valid: false, cleaned, error: "Use at least 3 letters." };
    if (cleaned.length > 30) return { valid: false, cleaned, error: "Keep it under 30 letters." };
    if (RESERVED.has(cleaned)) return { valid: true, available: false, cleaned };
    return { valid: true, cleaned, available: !TAKEN.has(cleaned) && !DB.stores.some((s) => s.subdomain === cleaned) };
  });
  on("POST", /^\/api\/signup$/, ({ json }) => {
    const j = json || {};
    const sub = String(j.subdomain || "").toLowerCase();
    if (!/^[a-z]{3,30}$/.test(sub) || RESERVED.has(sub) || TAKEN.has(sub) || DB.stores.some((s) => s.subdomain === sub)) fail(400, "That store name isn't available.");
    if (!/^\S+@\S+\.\S+$/.test(j.email || "")) fail(400, "Enter a valid email address.");
    if ((j.password || "").length < 8) fail(400, "Password must be at least 8 characters.");
    if (!j.agree_terms) fail(400, "You need to agree to the terms to continue.");
    if (DB.stores.some((s) => s.owner_email === j.email)) fail(400, "That email already has a store. Log in instead.");
    const s = Object.assign({}, STORE_DEFAULTS, { id: DB.nextId.store++, subdomain: sub, business_name: (j.business_name || "").trim() || sub, owner_email: j.email, password: j.password, is_physical: !!j.is_physical, created_at: stamp(), email: clone(STORE_DEFAULTS.email) });
    DB.stores.push(s);
    const token = mintToken(s.id);
    save();
    return { store: storeDict(s, true), token };
  });
  on("POST", /^\/api\/auth\/login$/, ({ json }) => {
    const j = json || {};
    const s = DB.stores.find((x) => x.owner_email === (j.email || "").trim());
    if (!s) fail(401, "No demo account with that email. Use demo@wildthread.co with any password, or create a store.");
    if (s.password !== "*" && s.password !== j.password) fail(401, "That email and password don't match.");
    return { token: mintToken(s.id), store: storeDict(s, true) };
  });
  on("POST", /^\/api\/logout$/, () => { const t = Auth.getStoreToken(); if (t) delete DB.tokens[t]; save(); return { ok: true }; });
  on("GET", /^\/api\/me$/, () => ({ store: storeDict(storeFromAuth(), true) }));

  // platform fees (setup, plan upgrade): payment confirms itself a few seconds after "sending"
  on("GET", /^\/api\/platform-pay\/options$/, () => { storeFromAuth(); return { auto: true, helcim: false, methods: { etransfer: { email: "pay@peltdev.com" }, paypal: { paypal_me: "peltdev" } } }; });
  on("POST", /^\/api\/platform-pay\/start$/, ({ json }) => {
    const s = storeFromAuth(); const j = json || {};
    let base = 2500;
    if (j.kind === "setup_fee") { if (s.setup_paid) fail(400, "Setup fee is already paid."); }
    else if (j.kind === "plan_upgrade") { const p = META.plans[j.plan_key]; if (!p) fail(400, "Unknown plan."); base = Math.round(p.price_dollars * 100); }
    else base = 4900;
    const extra = j.method === "etransfer" ? Math.floor(Math.random() * 9) + 1 : 0;
    const p = { id: DB.nextId.pp++, store_id: s.id, kind: j.kind, plan_key: j.plan_key || null, method: j.method, amount_cents: base + extra, base_cents: base, ref: "PELT-" + rid(), status: "pending", created_at: stamp(), subdomain: s.subdomain, pay_at: Date.now() + 6000 };
    DB.platformPayments.push(p); save();
    return { method: p.method, amount_cents: p.amount_cents, base_cents: base, email: "pay@peltdev.com", paypal_link: `https://www.paypal.me/peltdev/${(p.amount_cents / 100).toFixed(2)}CAD`, ref: p.ref, auto: true };
  });
  on("GET", /^\/api\/platform-pay\/([A-Z0-9-]+)$/, ({ m }) => { storeFromAuth(); const p = DB.platformPayments.find((x) => x.ref === m[1]); if (!p) fail(404, "Not found."); return { status: p.status }; });

  on("GET", /^\/api\/dashboard$/, () => {
    const s = storeFromAuth(); needPaid(s);
    const ords = DB.orders.filter((o) => o.store_id === s.id).sort((a, b) => b.id - a.id);
    const plan = planPublic(s), used = usedCents(s.id);
    return { cap_cents: plan.cap_cents, is_cut_off: false, near_cap: plan.cap_cents ? used >= plan.cap_cents * 0.9 : false, payment_connected: !!(s.paypal_me || s.etransfer_email || s.helcim_account_id), pending_orders: ords.filter((o) => o.paid && o.status === "paid").length, plan, product_count: DB.products.filter((p) => p.store_id === s.id).length, recent_orders: ords.slice(0, 5).map(orderDict), revenue_cents: paidOrders(s.id).reduce((a, o) => a + o.total_cents, 0), site_cutoff: "June 30, 2027", used_cents: used };
  });

  on("GET", /^\/api\/products$/, () => { const s = storeFromAuth(); needPaid(s); return { products: DB.products.filter((p) => p.store_id === s.id).sort((a, b) => b.id - a.id).map(productDict) }; });
  on("POST", /^\/api\/products$/, async ({ form }) => {
    const s = storeFromAuth(); needPaid(s);
    const name = String(fget(form, "name") || "").trim(), cents = Math.round(parseFloat(fget(form, "price") || "0") * 100);
    if (!name || !(cents > 0)) fail(400, "Give it a name and a price above $0.");
    let img = await readFile(fget(form, "image"));
    if (img === "TOO_BIG") { img = null; }
    const palette = [["#6B8FB3", "#3F5F85"], ["#C97B5A", "#8A4A32"], ["#8AA386", "#4F6D4B"], ["#A07AA8", "#65406E"], ["#D49A6A", "#9A6733"]];
    const [c1, c2] = palette[DB.nextId.product % palette.length];
    DB.products.push({ id: DB.nextId.product++, store_id: s.id, name, price_cents: cents, description: String(fget(form, "description") || "").trim(), image_path: img || art(c1, c2, ["circle", "ring", "bars", "diamond"][DB.nextId.product % 4]), active: true, created_at: stamp() });
    save(); return { ok: true };
  });
  on("POST", /^\/api\/products\/(\d+)\/toggle$/, ({ m }) => { const s = storeFromAuth(); const p = DB.products.find((x) => x.id === +m[1] && x.store_id === s.id); if (!p) fail(404, "Not found."); p.active = !p.active; save(); return { ok: true }; });

  on("GET", /^\/api\/orders$/, () => { const s = storeFromAuth(); needPaid(s); return { orders: DB.orders.filter((o) => o.store_id === s.id).sort((a, b) => b.id - a.id).map(orderDict) }; });
  on("POST", /^\/api\/orders\/(\d+)\/confirm$/, ({ m, json }) => {
    const s = storeFromAuth(); const o = DB.orders.find((x) => x.id === +m[1] && x.store_id === s.id); if (!o) fail(404, "Not found.");
    if (json && (json.tracking_number || json.tracking_carrier)) { o.status = "shipped"; o.tracking_carrier = json.tracking_carrier || null; o.tracking_number = json.tracking_number || null; } else if (o.status === "paid") o.status = "confirmed"; else o.status = "shipped";
    save(); return { ok: true };
  });
  on("POST", /^\/api\/orders\/(\d+)\/mark-paid$/, ({ m }) => { const s = storeFromAuth(); const o = DB.orders.find((x) => x.id === +m[1] && x.store_id === s.id); if (!o) fail(404, "Not found."); o.paid = true; o.status = "paid"; delete o.pay_at; save(); return { ok: true }; });

  on("GET", /^\/api\/payment-settings$/, () => { const s = storeFromAuth(); needPaid(s); return { auto_verify: !!s.email.configured, connected: !!(s.paypal_me || s.etransfer_email || s.helcim_account_id), etransfer_discount_pct: s.etransfer_discount_pct || 0, etransfer_email: s.etransfer_email, helcim_account_id: s.helcim_account_id, paypal_email: s.paypal_email, paypal_me: s.paypal_me }; });
  on("POST", /^\/api\/payment-settings$/, ({ json }) => {
    const s = storeFromAuth(); const j = json || {};
    if ("helcim_account_id" in j) { if (!j.helcim_account_id || !j.helcim_api_token) fail(400, "Enter both the account ID and API token."); s.helcim_account_id = String(j.helcim_account_id).trim(); save(); return { ok: true }; }
    if ("enable_paypal" in j) { if (j.enable_paypal) { const me = String(j.paypal_me || "").trim().replace(/^.*paypal\.me\//i, "").replace(/\W/g, ""); if (!me) fail(400, "Enter your PayPal.me name."); s.paypal_me = me; s.paypal_email = j.paypal_email || null; } else { s.paypal_me = null; s.paypal_email = null; } }
    if ("enable_etransfer" in j) { if (j.enable_etransfer) { if (!/^\S+@\S+\.\S+$/.test(j.etransfer_email || "")) fail(400, "Enter the email your e-Transfers go to."); s.etransfer_email = j.etransfer_email.trim(); } else s.etransfer_email = null; }
    s.etransfer_discount_pct = (s.paypal_me && s.etransfer_email) ? (parseInt(j.etransfer_discount_pct, 10) || 0) : 0;
    save(); return { ok: true };
  });
  on("GET", /^\/api\/email-settings$/, () => { const s = storeFromAuth(); return clone(s.email); });
  on("POST", /^\/api\/email-settings$/, async ({ json }) => {
    const s = storeFromAuth(); const j = json || {};
    if (!j.imap_user || !j.imap_password) fail(400, "Fill in the inbox and the app password.");
    await sleep(700);
    s.email = { configured: true, imap_host: j.imap_host || "imap.gmail.com", imap_user: j.imap_user, last_checked_at: stamp(), last_error: null }; save(); return { ok: true };
  });
  on("DELETE", /^\/api\/email-settings$/, () => { const s = storeFromAuth(); s.email = clone(STORE_DEFAULTS.email); save(); return { ok: true }; });
  on("POST", /^\/api\/email-settings\/test$/, ({ json }) => {
    storeFromAuth(); const raw = String((json && json.raw) || "");
    const good = /(interac|paypal)/i.test(raw) && /\$\s?\d/.test(raw);
    const checks = [["Sent by a bank, Interac or PayPal", good, good ? "From: notify@payments.interac.ca" : "Sender isn't a recognised bank, Interac or PayPal address."], ["Your mail provider verified the sender's signature", good, good ? "dkim=pass dmarc=pass" : "No Authentication-Results header found. Paste the whole 'Show original' text."], ["Addressed to you", good, good ? "To matches your e-Transfer address" : "To: none found"], ["Reads like a payment-received notice", good, good ? "Subject looks right" : "Subject: "], ["Not a refund, outgoing, or pending notice", true, "OK"], ["Found a payment amount", good, good ? "Found $32.00 outside fee/net/balance lines" : "No dollar amounts found"], ["Has a usable date", good, good ? "Date within the last hour" : "Date header missing or unreadable"]].map(([name, ok, detail]) => ({ name, ok, detail }));
    return { amounts: good ? [3200] : [], checks, verdict: good ? "paid" : "rejected_sender", message: good ? "This email WOULD mark an order paid (demo result)." : "This email would NOT pay anything: the sender isn't a bank/Interac/PayPal address.", waiting_for: DB.orders.filter((o) => !o.paid).slice(0, 2).map((o) => ({ id: o.id, method: o.payment_method, amount: "$" + (o.total_cents / 100).toFixed(2) })) };
  });

  on("GET", /^\/api\/customize$/, () => { const s = storeFromAuth(); needPaid(s); return { store: storeDict(s, true) }; });
  on("POST", /^\/api\/customize$/, async ({ form }) => {
    const s = storeFromAuth(); needPaid(s);
    let color = String(fget(form, "custom_color") || "").trim(); if (!HEX.test(color)) color = String(fget(form, "theme_color") || "").trim();
    if (HEX.test(color)) s.theme_color = color;
    const pick = (k, list) => { const v = String(fget(form, k) || "").trim(); if (list.includes(v)) s[k] = v; };
    pick("font_choice", Object.keys(META.font_pairings)); pick("layout_style", META.layout_styles.map((x) => x.key)); pick("accent_style", META.accent_styles.map((x) => x.key));
    pick("banner_style", META.banner_styles.map((x) => x.key)); pick("card_style", META.card_styles.map((x) => x.key)); pick("page_look", META.page_looks.map((x) => x.key)); pick("button_style", META.button_styles.map((x) => x.key));
    pick("hero_align", ["left", "center"]); pick("ships_to", META.ship_to_options.map((x) => x.key));
    const gc = parseInt(fget(form, "grid_columns"), 10); if ([2, 3, 4].includes(gc)) s.grid_columns = gc;
    s.tagline = String(fget(form, "tagline") || "").trim().slice(0, 120) || null;
    s.about_text = String(fget(form, "about_text") || "").trim().slice(0, 600) || null;
    s.announcement = String(fget(form, "announcement") || "").trim().slice(0, 140) || null;
    s.order_button_text = String(fget(form, "order_button_text") || "").trim().slice(0, 24) || null;
    s.footer_note = String(fget(form, "footer_note") || "").trim().slice(0, 300) || null;
    s.social_instagram = String(fget(form, "social_instagram") || "").trim().slice(0, 100) || null;
    let site = String(fget(form, "social_website") || "").trim().slice(0, 200); if (site && !/^https?:\/\//i.test(site)) site = "https://" + site; s.social_website = site || null;
    if (fget(form, "shipping_flat_dollars") !== null) s.shipping_flat_cents = Math.max(0, Math.round(parseFloat(fget(form, "shipping_flat_dollars") || "0") * 100) || 0);
    const logo = await readFile(fget(form, "logo")), ban = await readFile(fget(form, "banner"));
    if (logo === "TOO_BIG" || ban === "TOO_BIG") fail(400, "Demo mode keeps images under 900 KB. Try a smaller one.");
    if (logo) s.logo_image = logo; if (ban) s.banner_image = ban;
    save(); return { ok: true, store: storeDict(s, true) };
  });

  on("GET", /^\/api\/plan$/, () => {
    const s = storeFromAuth(); needPaid(s); const plan = planPublic(s);
    return { accrued_credit_cents: 0, cap_cents: plan.cap_cents, current_plan: plan, grace_days: 5, open_invoice: null, renews_at: s.plan_renews_at, used_cents: usedCents(s.id) };
  });
  on("GET", /^\/api\/plan\/upgrade\/([a-z]+)$/, ({ m }) => { storeFromAuth(); const p = META.plans[m[1]]; if (!p) fail(404, "Unknown plan."); const full = Math.round(p.price_dollars * 100); return { charge_cents: full, credit_cents: 0, full_price_cents: full, plan: clone(Object.assign({ key: m[1] }, p)) }; });

  // ------------------------------------------------------------ storefront + buyer side
  const storeBySub = (sub) => DB.stores.find((s) => s.subdomain === String(sub).toLowerCase());
  on("GET", /^\/api\/stores\/([a-z]+)$/, ({ m }) => {
    const s = storeBySub(m[1]); if (!s || s.suspended || !s.setup_paid) fail(404, "No such store.");
    return { closed: false, products: DB.products.filter((p) => p.store_id === s.id && p.active).map(productDict), root_domain: ROOT, store: storeDict(s, false) };
  });
  on("POST", /^\/api\/stores\/([a-z]+)\/checkout$/, ({ m, json }) => {
    const s = storeBySub(m[1]); if (!s || !s.setup_paid) fail(404, "No such store.");
    const j = json || {};
    if (!j.agree_terms) fail(400, "Please agree to the terms to place your order.");
    if (!/^\S+@\S+\.\S+$/.test(j.customer_email || "")) fail(400, "Enter a valid email address.");
    const items = [];
    (j.items || []).forEach((it) => { const p = DB.products.find((x) => x.id === it.product_id && x.store_id === s.id && x.active); if (p && it.qty > 0) items.push({ name: p.name, price_cents: p.price_cents, product_id: p.id, qty: Math.min(99, it.qty) }); });
    if (!items.length) fail(400, "Add at least one item to your order.");
    let addr = null;
    if (s.is_physical) {
      const sh = j.shipping || {};
      if (!sh.name || !sh.street || !sh.city || !sh.province || !sh.postal_code) fail(400, "Please fill in your full shipping address.");
      const cc = sh.country || "CA";
      if (cc === "CA" && !/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(sh.postal_code.trim())) fail(400, "That doesn't look like a Canadian postal code (like A1A 1A1).");
      if (cc === "US" && !/^\d{5}(-\d{4})?$/.test(sh.postal_code.trim())) fail(400, "That doesn't look like a US ZIP code.");
      addr = [sh.name, [sh.street, sh.unit].filter(Boolean).join(", "), `${sh.city} ${sh.province} ${sh.postal_code}`, cc === "CA" ? "Canada" : cc === "US" ? "United States" : (cc || "")].join("\n");
    }
    const methods = [s.etransfer_email && "etransfer", s.helcim_account_id && "helcim", s.paypal_me && "paypal"].filter(Boolean);
    const method = methods.includes(j.payment_method) ? j.payment_method : methods[0] || "";
    const sub = items.reduce((a, it) => a + it.price_cents * it.qty, 0), ship = s.is_physical ? (s.shipping_flat_cents || 0) : 0;
    let total = sub + ship;
    if (method === "etransfer" && s.paypal_me && s.etransfer_discount_pct) total = Math.round(total * (100 - s.etransfer_discount_pct) / 100);
    const o = { id: DB.nextId.order++, store_id: s.id, created_at: stamp(), items, total_cents: total, shipping_cents: ship, paid: false, status: "awaiting_payment", payment_method: method, payment_ref: "ORD-" + rid(), etransfer_amount_cents: method === "etransfer" ? total + (DB.orders.some((x) => !x.paid && x.store_id === s.id && x.total_cents === total) ? 1 : 0) : null, needs_shipping: !!s.is_physical, tracking_carrier: null, tracking_number: null, customer_name: j.customer_name || "", customer_email: j.customer_email, shipping_address: addr };
    if (method === "etransfer" || method === "paypal") o.pay_at = Date.now() + 9000;
    DB.orders.push(o); save();
    return { amount_cents: o.etransfer_amount_cents || total, etransfer_email: s.etransfer_email, order_id: o.id, payment_method: method, payment_ref: o.payment_ref };
  });
  on("GET", /^\/api\/stores\/([a-z]+)\/orders\/(\d+)$/, ({ m }) => {
    const s = storeBySub(m[1]); if (!s) fail(404, "No such store.");
    const o = DB.orders.find((x) => x.id === +m[2] && x.store_id === s.id); if (!o) fail(404, "No such order.");
    const amt = ((o.etransfer_amount_cents || o.total_cents) / 100).toFixed(2);
    return { auto_verify: true, order: orderDict(o), payment_connected: !!(s.paypal_me || s.etransfer_email || s.helcim_account_id), paypal_link: s.paypal_me ? `https://www.paypal.me/${s.paypal_me}/${amt}CAD` : null, store: storeDict(s, false) };
  });
  on("POST", /^\/api\/stores\/([a-z]+)\/orders\/(\d+)\/pay\/init$/, () => ({ checkoutToken: "demo", paymentRef: "demo" }));
  on("POST", /^\/api\/stores\/([a-z]+)\/orders\/(\d+)\/pay\/confirm$/, ({ m }) => { const s = storeBySub(m[1]); const o = s && DB.orders.find((x) => x.id === +m[2] && x.store_id === s.id); if (!o) fail(404, "No such order."); o.paid = true; o.status = "paid"; delete o.pay_at; save(); return { ok: true }; });
  on("POST", /^\/api\/support$/, ({ json }) => { const j = json || {}; if (!j.email || !j.message) fail(400, "Add your email and a message."); DB.support.push({ id: DB.nextId.msg++, email: j.email, subject: j.subject || "", message: j.message, store_subdomain: j.store_subdomain || "", created_at: stamp() }); save(); return { ok: true }; });

  // ------------------------------------------------------------ owner portal
  on("POST", /^\/api\/auth\/owner\/login$/, ({ json }) => { if (!json || !json.password) fail(401, "Enter the owner password."); return { token: "demo-owner" }; });
  on("POST", /^\/api\/owner\/logout$/, () => ({ ok: true }));
  on("GET", /^\/api\/owner\/overview$/, ({ query }) => {
    ownerOk();
    const stores = DB.stores, paid = DB.orders.filter((o) => o.paid);
    const withStore = (o) => Object.assign(orderDict(o), { business_name: stores.find((s) => s.id === o.store_id).business_name, subdomain: stores.find((s) => s.id === o.store_id).subdomain });
    let list = DB.orders.slice().sort((a, b) => b.id - a.id);
    const fStore = query.get("store") || "", fStatus = query.get("status") || "";
    if (fStore) list = list.filter((o) => stores.find((s) => s.id === o.store_id).subdomain === fStore);
    if (fStatus) list = list.filter((o) => (o.paid ? o.status : "awaiting_payment") === fStatus);
    const per = 25, pages = Math.max(1, Math.ceil(list.length / per)), page = Math.min(pages, Math.max(1, parseInt(query.get("page"), 10) || 1));
    const counts = {}; stores.forEach((s) => { counts[s.plan] = (counts[s.plan] || 0) + 1; });
    const planRev = DB.platformPayments.filter((p) => p.status === "paid" && p.kind !== "setup_fee").reduce((a, p) => a + p.base_cents, 0) + 3500;
    return {
      avg_order_cents: paid.length ? Math.round(paid.reduce((a, o) => a + o.total_cents, 0) / paid.length) : 0, chart_svg: chartSvg(DB.orders), filters: { page, status: fStatus, store: fStore, total_pages: pages }, is_cut_off: false,
      orders: list.slice((page - 1) * per, page * per).map(withStore), paid_order_count: paid.length, plan_counts: counts, plan_revenue_cents: planRev, root_domain: ROOT,
      setup_revenue_cents: stores.filter((s) => s.setup_paid).length * 2500, stores: stores.map(ownerStoreRow), support_messages: DB.support.slice().sort((a, b) => b.id - a.id),
      top_sellers: stores.map((s) => ({ business_name: s.business_name, id: s.id, owner_email: s.owner_email, paid_orders: paidOrders(s.id).length, revenue_cents: paidOrders(s.id).reduce((a, o) => a + o.total_cents, 0), subdomain: s.subdomain })).sort((a, b) => b.revenue_cents - a.revenue_cents),
      total_order_volume_cents: paid.reduce((a, o) => a + o.total_cents, 0),
    };
  });
  on("GET", /^\/api\/owner\/stores\/(\d+)$/, ({ m }) => {
    ownerOk(); const s = DB.stores.find((x) => x.id === +m[1]); if (!s) fail(404, "Not found.");
    const plan = planPublic(s), ords = DB.orders.filter((o) => o.store_id === s.id).sort((a, b) => b.id - a.id);
    return { cap_cents: plan.cap_cents, chart_svg: chartSvg(ords), orders: ords.map(orderDict), paid_count: paidOrders(s.id).length, plan, products: DB.products.filter((p) => p.store_id === s.id).map(productDict), revenue_cents: paidOrders(s.id).reduce((a, o) => a + o.total_cents, 0), root_domain: ROOT, store: storeDict(s, true), used_cents: usedCents(s.id) };
  });
  const ownerAct = (name, fn) => on("POST", new RegExp("^\\/api\\/owner\\/stores\\/(\\d+)\\/" + name + "$"), ({ m, json }) => { ownerOk(); const s = DB.stores.find((x) => x.id === +m[1]); if (!s) fail(404, "Not found."); fn(s, json || {}); DB.audit.push({ id: DB.audit.length + 1, action: "owner_" + name.replace("-", "_"), actor_type: "owner", actor_label: "owner", detail: s.subdomain, ip: "127.0.0.1", created_at: stamp() }); save(); return { ok: true }; });
  ownerAct("waive-setup", (s) => { s.setup_paid = true; });
  ownerAct("comp", (s) => { s.plan = "comp"; });
  ownerAct("uncomp", (s) => { s.plan = "starter"; });
  ownerAct("suspend", (s, j) => { s.suspended = true; s.suspended_reason = j.reason || "Suspended by the platform owner."; });
  ownerAct("unsuspend", (s) => { s.suspended = false; s.suspended_reason = null; });
  on("GET", /^\/api\/owner\/security$/, () => { ownerOk(); return { events: DB.audit.slice().sort((a, b) => b.id - a.id), locks: [], pyotp_installed: true, totp_enabled: false }; });
  on("GET", /^\/api\/owner\/fee-whatif$/, () => {
    ownerOk();
    return { stores: DB.stores.map((s) => { const cap = planOf(s).cap_cents, capV = cap || 1000000, avg = Math.max(500, Math.round(paidOrders(s.id).reduce((a, o) => a + o.total_cents, 0) / Math.max(1, paidOrders(s.id).length)) || 2500), n = Math.max(1, Math.round(capV / avg)); const ach = (c) => Math.min(Math.round(c * 0.005) + 25, 600), card = (c) => Math.round(c * 0.0249) + 25; return { at_cap: { ach_cents: ach(avg) * n, cap_cents: capV, cap_is_assumed: !cap, card_cents: card(avg) * n, card_high_cents: Math.round(card(avg) * n * 1.15), orders: n }, avg_is_assumed: false, avg_order_cents: avg, month_orders: paidOrders(s.id).length, month_so_far: { ach_cents: ach(avg) * paidOrders(s.id).length, card_cents: card(avg) * paidOrders(s.id).length }, month_volume_cents: usedCents(s.id), per_order: { ach_cents: ach(avg), card_cents: card(avg), card_high_cents: Math.round(card(avg) * 1.15) }, plan: s.plan, store_id: s.id, subdomain: s.subdomain }; }) };
  });
  on("GET", /^\/api\/owner\/platform-payments$/, () => { ownerOk(); return { auto: true, methods: ["etransfer", "paypal"], payments: DB.platformPayments.slice().sort((a, b) => b.id - a.id).map((p) => ({ id: p.id, kind: p.kind, method: p.method, amount_cents: p.amount_cents, ref: p.ref, status: p.status, created_at: p.created_at, subdomain: p.subdomain, business_name: (DB.stores.find((s) => s.id === p.store_id) || {}).business_name || "", plan_key: p.plan_key || null })) }; });
  on("POST", /^\/api\/owner\/platform-payments\/(\d+)\/confirm$/, ({ m }) => { ownerOk(); const p = DB.platformPayments.find((x) => x.id === +m[1]); if (!p) fail(404, "Not found."); applyPlatformPayment(p); save(); return { ok: true }; });

  // ------------------------------------------------------------ entry point
  async function handle(path, { method = "GET", json = null, form = null } = {}) {
    load(); tick();
    await sleep(120 + Math.random() * 140); // feel like a network, not a function call
    const [pathname, qs] = path.split("?");
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) return r.fn({ m, json, form, query: new URLSearchParams(qs || "") });
    }
    fail(404, "Not available in demo mode.");
  }
  return { handle, reset, load };
})();
