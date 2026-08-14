const webpush = require('web-push');

const SUPABASE_URL = "https://nvniycrgdfvgphcvptsh.supabase.co";
const SUPABASE_KEY = "sb_publishable_gkHDuvNM75l5krS0vPQegA_FaQzI0jG";
const BOARD_ID = "rodina";

const VAPID_PUBLIC_KEY = "BOWPQW4wq0x3MnSppFqqNnSmcieO0awp0xgB3MF7H7TXPUi93j8f9LMgGq_-_OP-6wUpvtvwe6paQvLQrls9rrk";

webpush.setVapidDetails(
  "https://ladislav-apps.vercel.app",
  VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${path} -> ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: "VAPID_PRIVATE_KEY not configured" });
    return;
  }

  const { title, body, url, excludeEndpoint } = req.body || {};

  let subs;
  try {
    subs = await supabaseRequest(`push_subscriptions?board_id=eq.${BOARD_ID}&select=*`);
  } catch (e) {
    res.status(500).json({ error: String(e) });
    return;
  }

  const payload = JSON.stringify({
    title: title || "Nákupní seznam",
    body: body || "Někdo upravil nákupní seznam.",
    url: url || "/shopping",
  });

  const results = await Promise.all(
    (subs || [])
      .filter((s) => s.endpoint !== excludeEndpoint)
      .map(async (s) => {
        const subscription = {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        };
        try {
          await webpush.sendNotification(subscription, payload);
          return { endpoint: s.endpoint, ok: true };
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabaseRequest(`push_subscriptions?id=eq.${s.id}`, { method: "DELETE" }).catch(() => {});
          }
          return { endpoint: s.endpoint, ok: false, error: String(err) };
        }
      })
  );

  res.status(200).json({ sent: results.filter((r) => r.ok).length, total: results.length, results });
};
