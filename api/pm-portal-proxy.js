// api/pm-portal-proxy.js
// Vercel serverless function. Relays requests from the static PM Portal
// page to the Apps Script Web App backend, server-to-server — this avoids
// CORS entirely, since Apps Script Web Apps don't handle cross-origin
// preflight requests reliably when called directly from a browser on a
// different domain. Same pattern as api/csv-proxy.js for the CEO dashboard.

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzTw_5Yz_bCRo83tZQ0nCOP2wtXPX5APe3pQwa4P9yNVNfeTKqh1Hc3JNQekq6eJgdgbQ/exec";
// Looks like: https://script.google.com/macros/s/AKfycb.../exec

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({success: false, message: "Only POST requests are supported."});
    return;
  }

  if (APPS_SCRIPT_URL.indexOf("PASTE_") === 0) {
    res.status(500).json({success: false, message: "Proxy not configured — APPS_SCRIPT_URL is still a placeholder."});
    return;
  }

  try {
    // Vercel's default body parser treats a text/plain request body as a
    // raw STRING, not a parsed object (only application/json gets
    // auto-parsed) — but the frontend deliberately sends text/plain to
    // avoid a CORS preflight. So req.body here is the literal JSON text,
    // not an object yet. Parse it ourselves before re-sending, otherwise
    // JSON.stringify(req.body) below would double-encode it into a JSON
    // string-of-a-string, which Apps Script parses back into a plain
    // string (not an object) — body.action becomes undefined, and every
    // call silently falls through to the "unknown action" branch.
    let payload = req.body;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch (e) { /* leave as-is if truly not JSON */ }
    }

    // Apps Script Web Apps respond to every request with a redirect to a
    // temporary googleusercontent.com URL that holds the already-computed
    // result (doPost() has ALREADY run by this point). If we let fetch
    // auto-follow that redirect, the WHATWG spec silently converts our POST
    // into a GET — usually harmless here since it's just fetching a static
    // result, but auto-follow was returning an HTML page in practice, so we
    // handle it explicitly: capture the redirect, then GET the result URL.
    let upstream = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "manual",
    });

    // A 302/303 here is expected — Apps Script has ALREADY run doPost() by
    // this point; the redirect target is just a static URL holding the
    // already-computed result, so we fetch it with GET, not another POST.
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) {
        res.status(502).json({success: false, message: "Redirect from Apps Script had no Location header."});
        return;
      }
      upstream = await fetch(location, {
        method: "GET",
        redirect: "follow",
      });
    }

    const text = await upstream.text();
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({success: false, message: "Proxy error: " + String(err)});
  }
}
