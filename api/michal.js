// Write endpoint for the "Michal" app.
// The browser can only READ michal_entries (Supabase RLS). Every change goes through here:
// the password is checked against the MICHAL_PASSWORD env var and the write is done
// with the secret key from SUPABASE_SECRET_KEY, which never leaves the server.

const crypto = require("crypto");

const SUPABASE_URL = "https://nvniycrgdfvgphcvptsh.supabase.co";
const TABLE = "michal_entries";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sameSecret(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function supabase(path, options, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
}

function validEntry(e) {
  if (!e || typeof e !== "object") return null;
  if (!DATE_RE.test(e.date || "")) return null;
  const amount = Number(e.amount);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e9) return null;
  const note = typeof e.note === "string" ? e.note.trim().slice(0, 500) : "";
  return { entry_date: e.date, amount: Math.round(amount * 100) / 100, note: note || null };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const PASSWORD = process.env.MICHAL_PASSWORD;
  const KEY = process.env.SUPABASE_SECRET_KEY;
  if (!PASSWORD || !KEY) {
    res.status(500).json({ error: "Server není nastavený (chybí MICHAL_PASSWORD nebo SUPABASE_SECRET_KEY)." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  if (!sameSecret(body.password || "", PASSWORD)) {
    await sleep(800); // slow down guessing
    res.status(401).json({ error: "Heslo nesouhlasí." });
    return;
  }

  const { action, entry } = body;

  try {
    if (action === "verify") {
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "insert") {
      const row = validEntry(entry);
      if (!row) { res.status(400).json({ error: "Neplatný záznam." }); return; }
      await supabase(TABLE, { method: "POST", body: JSON.stringify(row) }, KEY);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "update") {
      const row = validEntry(entry);
      if (!row || !UUID_RE.test(entry.id || "")) { res.status(400).json({ error: "Neplatný záznam." }); return; }
      await supabase(`${TABLE}?id=eq.${entry.id}`, { method: "PATCH", body: JSON.stringify(row) }, KEY);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "delete") {
      if (!entry || !UUID_RE.test(entry.id || "")) { res.status(400).json({ error: "Neplatné ID." }); return; }
      await supabase(`${TABLE}?id=eq.${entry.id}`, { method: "DELETE" }, KEY);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "Neznámá akce." });
  } catch (e) {
    console.error("api/michal:", e);
    res.status(500).json({ error: "Uložení do databáze se nepovedlo." });
  }
};
