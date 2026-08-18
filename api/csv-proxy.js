// api/csv-proxy.js
// Vercel serverless function. Fetches the published Google Sheets CSV
// server-side (no browser CORS involved) and returns it with permissive
// CORS headers so the dashboard's client-side fetch() always succeeds.
//
// Deploy: drop this file at api/csv-proxy.js in your Vercel project.
// The dashboard should then fetch "/api/csv-proxy" instead of the Google URL directly.

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRaTMMYz9tevz4FJkN5rpdfb5UD955CBW-j_dwyHNZ4rTZUHljBRsVTL7U1JVtQh9p_EsBxvfU56RBd/pub?gid=1359357118&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const upstream = await fetch(SHEET_CSV_URL, {
      // Cache-busting: Google's edge can cache the published CSV for a few
      // minutes. This header discourages any intermediate cache from serving
      // a stale copy back to our serverless function.
      headers: { "Cache-Control": "no-cache" },
      redirect: "follow",
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `Upstream fetch failed with status ${upstream.status}`,
      });
      return;
    }

    const text = await upstream.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    // Don't let Vercel's own edge cache serve a stale copy either.
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
