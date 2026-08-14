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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dueDateStr) {
  const today = new Date(todayStr() + "T00:00:00Z");
  const due = new Date(dueDateStr + "T00:00:00Z");
  return Math.round((due - today) / 86400000);
}

module.exports = async (req, res) => {
  if (!process.env.VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: "VAPID_PRIVATE_KEY not configured" });
    return;
  }

  const today = todayStr();

  let deadlines, subs;
  try {
    deadlines = await supabaseRequest(`deadlines?board_id=eq.${BOARD_ID}&select=*`);
    subs = await supabaseRequest(`push_subscriptions?board_id=eq.${BOARD_ID}&select=*`);
  } catch (e) {
    res.status(500).json({ error: String(e) });
    return;
  }

  const due = (deadlines || []).filter((d) => {
    if (d.last_notified_date === today) return false;
    return daysUntil(d.due_date) === 7;
  });

  if (due.length === 0) {
    res.status(200).json({ checked: (deadlines || []).length, notified: 0 });
    return;
  }

  for (const d of due) {
    const payload = JSON.stringify({
      title: "Termíny",
      body: `Za týden: ${d.title}${d.tag ? " (" + d.tag + ")" : ""}`,
      url: "/terminy",
    });

    await Promise.all(
      (subs || []).map(async (s) => {
        const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        try {
          await webpush.sendNotification(subscription, payload);
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabaseRequest(`push_subscriptions?id=eq.${s.id}`, { method: "DELETE" }).catch(() => {});
          }
        }
      })
    );

    await supabaseRequest(`deadlines?id=eq.${d.id}`, {
      method: "PATCH",
      body: JSON.stringify({ last_notified_date: today }),
    }).catch((e) => console.error("update last_notified_date:", e));
  }

  res.status(200).json({ checked: (deadlines || []).length, notified: due.length });
};
