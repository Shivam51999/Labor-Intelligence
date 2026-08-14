// api/pm-portal-proxy.js
// Vercel serverless function. Relays requests from the static PM Portal
// page to the Apps Script Web App backend, server-to-server — this avoids
// CORS entirely, since Apps Script Web Apps don't handle cross-origin
// preflight requests reliably when called directly from a browser on a
// different domain. Same pattern as api/csv-proxy.js for the CEO dashboard.

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzmYg8RBi7t3dKIxp66Nh8Zd1NOqgMKeH5V57SRgjPYIY9SsSXIeZ9wHEF6R8vl3Phalg/exec";
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
    // Apps Script Web Apps respond to every request with a redirect to an
    // internal googleusercontent.com URL before returning the real result.
    // If we let fetch auto-follow that redirect, the WHATWG spec silently
    // converts our POST into a GET and drops the body — which means
    // Apps Script's doGet() runs instead of doPost(), returning the wrong
    // response shape entirely. So we follow the redirect ourselves,
    // manually, as a POST, to keep the body intact.
    let upstream = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(req.body),
      redirect: "manual",
    });

    // A 302/303 here is expected — follow it ourselves as a POST.
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) {
        res.status(502).json({success: false, message: "Redirect from Apps Script had no Location header."});
        return;
      }
      upstream = await fetch(location, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(req.body),
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
