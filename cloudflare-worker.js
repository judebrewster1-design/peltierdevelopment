/**
 * Cloudflare Worker - makes real subdomains (bracelets.peltdev.com) work.
 *
 * WHY THIS EXISTS: GitHub Pages cannot serve a wildcard domain. You can point
 * it at exactly one custom domain (peltdev.com), but not at "whatever anyone
 * types before .peltdev.com" - that has to be decided ahead of time on
 * GitHub's side, and sellers pick their store name at signup, dynamically.
 * There is no way to pre-register each one with GitHub as it's created.
 *
 * THE FIX: this Worker sits in front of the wildcard DNS record instead.
 * Every request to *.peltdev.com hits this Worker first. It doesn't need to
 * know or care what the subdomain even is - the SPA figures that out itself
 * from location.hostname (see HOST_SUBDOMAIN in app.js). All this Worker
 * does is fetch the exact same static files from GitHub Pages and hand them
 * back, for every subdomain, unmodified. One set of files, infinite
 * storefronts - because it's a single-page app, the same index.html/app.js
 * genuinely is the whole site regardless of which store's data ends up
 * displayed once app.js runs in the browser.
 *
 * ============================================================================
 * CONFIGURE THIS BEFORE DEPLOYING - the one thing you MUST edit:
 * ============================================================================
 * Your actual GitHub Pages origin - the *.github.io URL your repo deploys to,
 * BEFORE any custom domain is applied to it. Find it in your repo's Settings
 * → Pages page. It's almost always one of these two shapes:
 *   - "https://yourusername.github.io"              (repo named yourusername.github.io)
 *   - "https://yourusername.github.io/your-repo-name" (any other repo name)
 */
const GITHUB_PAGES_ORIGIN = "https://REPLACE-WITH-YOUR-USERNAME.github.io/REPLACE-WITH-YOUR-REPO-NAME";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = new URL(GITHUB_PAGES_ORIGIN);

    // Rebuild the request against GitHub Pages' own host, keeping the path
    // (joined onto GitHub Pages' own base path, in case your repo isn't named
    // <username>.github.io and so lives under a /repo-name/ prefix there) and
    // query string exactly as the browser sent them. Nothing about which
    // subdomain the visitor is on gets passed along - it doesn't need to be,
    // the browser already knows its own hostname and app.js reads it directly.
    const originPath = (origin.pathname === "/" ? "" : origin.pathname) + url.pathname;
    const originURL = origin.origin + originPath + url.search;

    const originRequest = new Request(originURL, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    });

    const response = await fetch(originRequest);

    // Clone the response so we can safely change headers - GitHub Pages'
    // response object is otherwise immutable once received here.
    const out = new Response(response.body, response);
    // GitHub Pages sends its own caching/security headers tuned for its own
    // domain; strip anything that could fight with serving this content under
    // a completely different hostname than what GitHub thinks it's on.
    out.headers.delete("content-security-policy");
    return out;
  },
};

/**
 * ============================================================================
 * DEPLOYING THIS (one-time setup)
 * ============================================================================
 * 1. Install Wrangler (Cloudflare's CLI), if you don't have it:
 *      npm install -g wrangler
 * 2. In this frontend/ folder, log in and create the Worker:
 *      wrangler login
 *      wrangler deploy cloudflare-worker.js --name peltdev-storefronts
 * 3. In the Cloudflare dashboard, go to your domain → Workers Routes (or
 *    Workers & Pages → your Worker → Triggers → Add route) and add:
 *      Route:  *.peltdev.com/*
 *      Zone:   peltdev.com
 *    This is what tells Cloudflare "send wildcard subdomain traffic here"
 *    instead of trying to resolve it as a normal DNS lookup.
 * 4. Add ONE DNS record in Cloudflare for the wildcard itself:
 *      Type: A     Name: *     Content: 192.0.2.1     Proxy status: Proxied (orange cloud)
 *    The IP address here is intentionally a placeholder/unused one - once the
 *    Workers Route above exists, Cloudflare intercepts the request before it
 *    ever tries to actually reach that IP, so the DNS record just needs to
 *    exist and be proxied through Cloudflare (orange cloud, not grey/DNS-only).
 * 5. Leave your existing peltdev.com / www.peltdev.com records exactly as
 *    they are - this only affects the wildcard, not the root domain, which
 *    keeps working through GitHub Pages' own custom-domain setup as before.
 *
 * Test it: visit https://anything.peltdev.com/ - if this is wired up right,
 * you'll see the exact same site as peltdev.com itself (app.js then notices
 * the "anything" subdomain and shows that store instead of the homepage -
 * or "Not found" if no store is actually named that yet).
 */
