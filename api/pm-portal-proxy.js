// api/pm-portal-proxy.js
// Vercel serverless function. Relays requests from the static PM Portal
// page to the Apps Script Web App backend, server-to-server — this avoids
// CORS entirely, since Apps Script Web Apps don't handle cross-origin
// preflight requests reliably when called directly from a browser on a
// different domain. Same pattern as api/csv-proxy.js for the CEO dashboard.

const APPS_SCRIPT_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRaTMMYz9tevz4FJkN5rpdfb5UD955CBW-j_dwyHNZ4rTZUHljBRsVTL7U1JVtQh9p_EsBxvfU56RBd/pub?gid=1716367919&single=true&output=csv";
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
    const upstream = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight on OUR side of the relay too
      body: JSON.stringify(req.body),
      redirect: "follow", // Apps Script Web Apps issue a redirect before returning the real response
    });

    const text = await upstream.text();
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({success: false, message: "Proxy error: " + String(err)});
  }
}
