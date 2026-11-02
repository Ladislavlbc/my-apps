// Denní dotaz do Supabase, aby se free projekt kvůli neaktivitě nepozastavil.
// Volá ho Vercel Cron (viz vercel.json) a posílá hlavičku Authorization: Bearer CRON_SECRET.

const SUPABASE_URL = "https://nvniycrgdfvgphcvptsh.supabase.co";
const SUPABASE_KEY = "sb_publishable_gkHDuvNM75l5krS0vPQegA_FaQzI0jG";

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).send("Unauthorized");
    return;
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/deadlines?select=id&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
};
