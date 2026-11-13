// Handles the Schedule form. Everything else on the site is served as plain files.
// Each request is checked, then emailed to the firm. The address it goes to is kept
// in Cloudflare (a secret named NOTIFY_TO), not in this repository.

const FROM = { email: "website@jantzwealth.com", name: "Jantz Wealth Advisors website" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, " ");
const list = (v) => (Array.isArray(v) ? v : []).slice(0, 12).map((x) => oneLine(x, 80)).filter(Boolean);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/schedule") return json({ ok: false, error: "not_found" }, 404);
    if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);

    // Only accept submissions sent from this site's own pages.
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json({ ok: false, error: "origin" }, 403);

    let d;
    try {
      const raw = await request.text();
      if (raw.length > 20000) return json({ ok: false, error: "too_large" }, 413);
      d = JSON.parse(raw);
    } catch { return json({ ok: false, error: "bad_request" }, 400); }
    if (!d || typeof d !== "object") return json({ ok: false, error: "bad_request" }, 400);

    // Hidden field filled in: a bot. Say thanks, send nothing.
    if (clean(d.company, 200)) return json({ ok: true });

    const a = {
      first: oneLine(d.first, 80), last: oneLine(d.last, 80), email: oneLine(d.email, 160), phone: oneLine(d.phone, 40),
      state: oneLine(d.state, 40), times: list(d.times), stage: oneLine(d.stage, 120), topics: list(d.topics), note: clean(d.note, 4000)
    };
    const digits = a.phone.replace(/\D/g, "");
    if (!a.first || !a.last || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email) || digits.length < 10 || digits.length > 11) {
      return json({ ok: false, error: "missing_fields" }, 422);
    }
    if (!env.EMAIL || !env.NOTIFY_TO) { console.error("Schedule form: email is not set up"); return json({ ok: false, error: "not_configured" }, 503); }

    const rows = [
      ["Name", `${a.first} ${a.last}`], ["Phone", a.phone], ["Email", a.email], ["State", a.state || "Not given"],
      ["Best time to call", a.times.join(", ") || "Not given"], ["Retirement stage", a.stage || "Not given"],
      ["Wants to talk about", a.topics.join(", ") || "Not given"], ["Anything else", a.note || "Nothing added"]
    ];
    const text = "New conversation request from the website.\n\n" + rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nReply to this email to write back to them.";
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#232E3D"><p>New conversation request from the website.</p><table cellpadding="0" cellspacing="0" style="border-collapse:collapse">` +
      rows.map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#4A4F55;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap"><strong>${esc(v)}</strong></td></tr>`).join("") +
      `</table><p style="color:#4A4F55">Reply to this email to write back to them.</p></div>`;

    try {
      const to = String(env.NOTIFY_TO).split(",").map((s) => s.trim()).filter(Boolean);
      await env.EMAIL.send({ to, from: FROM, replyTo: { email: a.email, name: `${a.first} ${a.last}` },
        subject: `New conversation request: ${a.first} ${a.last}${a.state ? ", " + a.state : ""}`, text, html });
      return json({ ok: true });
    } catch (e) {
      console.error("Schedule form: send failed", e && e.code, e && e.message);
      return json({ ok: false, error: "send_failed" }, 502);
    }
  }
};
