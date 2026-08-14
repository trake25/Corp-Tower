// The site's only server-side route: POST /api/contact, behind the same Worker
// that serves the static assets. `run_worker_first` in wrangler.jsonc scopes it
// to that one path, so every other request still goes straight to the asset
// router and `not_found_handling` behaves exactly as it did before.
//
// Plain JavaScript on purpose: no bundler config, no npm dependency, and
// nothing for `astro check` to walk. Config and setup: site/docs/deploy.md.

const ROUTE = "/api/contact";
const ALLOWED_ORIGIN = "https://enportfolio.galaxxigames.com";
const SOURCE = "enportfolio.galaxxigames.com";

// A JSON body that cannot hold a valid submission is not worth parsing.
const MAX_BODY_BYTES = 8 * 1024;
const NAME_MAX = 100;
const EMAIL_MAX = 200;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;

// A human needs a few seconds to type three fields; a session left open all day
// is a stale timestamp, not a submission.
const MIN_FILL_MS = 3_000;
const MAX_FILL_MS = 2 * 60 * 60 * 1000;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// CR, LF and the rest of C0/C1. Both fields reach a mail header.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const ok = () => json({ ok: true }, 200);
// Deliberately vague: which guardrail fired is not the sender's business.
const fail = (error, status) => json({ ok: false, error }, status);

function dayKey() {
  return `sent:${new Date().toISOString().slice(0, 10)}`;
}

async function underDailyCap(env) {
  if (!env.CONTACT_KV) return { allowed: true, key: null, count: 0 };
  const cap = Number(env.CONTACT_DAILY_CAP ?? 50);
  const key = dayKey();
  const count = Number((await env.CONTACT_KV.get(key)) ?? 0);
  return { allowed: count < cap, key, count };
}

async function bumpDailyCount(env, key, count) {
  if (!env.CONTACT_KV || !key) return;
  // Best effort. A lost increment under-counts, which errs toward sending a
  // real message rather than dropping one.
  await env.CONTACT_KV.put(key, String(count + 1), { expirationTtl: 60 * 60 * 48 });
}

async function withinRateLimits(env, ip) {
  for (const [limiter, key] of [
    [env.CONTACT_RL_IP, ip],
    [env.CONTACT_RL_ALL, "global"],
  ]) {
    if (!limiter) continue;
    const { success } = await limiter.limit({ key });
    if (!success) return false;
  }
  return true;
}

function readField(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

// Never trust the dialog's copy of these rules — it is client code and can be
// replaced by anything that can open a socket.
function validate(payload) {
  const name = readField(payload.name, NAME_MAX);
  if (!name) return { error: "invalid name" };

  const email = readField(payload.email, EMAIL_MAX);
  if (!email || email.length < 3 || !EMAIL_SHAPE.test(email)) return { error: "invalid email" };

  // Fails closed rather than stripping: a newline in either of the two fields
  // that reach a mail header is an injection attempt, not a typo.
  if (CONTROL_CHARS.test(name) || CONTROL_CHARS.test(email)) {
    return { error: "invalid input" };
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return { error: "invalid message" };
  }

  return { name, email, message };
}

function buildBody({ name, email, message }) {
  return [
    "New message from your portfolio.",
    "",
    "Name:",
    name,
    "",
    "Email:",
    email,
    "",
    "Message:",
    message,
    "",
    "Source:",
    SOURCE,
  ].join("\n");
}

// The route deploys before its credentials do, so it has to be able to say it
// cannot send yet. Presence only -- no value of any of the three ever leaves.
// Whitespace-only counts as absent: a secret pasted as a stray newline would
// otherwise report ready and then fail at the provider.
const present = value => typeof value === "string" && value.trim() !== "";

const mailConfigured = env =>
  present(env.RESEND_API_KEY) && present(env.CONTACT_TO) && present(env.CONTACT_FROM);

// The one place that knows which provider sends the mail. A network failure
// here has to read the same as a rejection, or the visitor gets a 500 with no
// message instead of the dialog's retry line.
async function send(env, fields) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM.trim(),
        to: [env.CONTACT_TO.trim()],
        reply_to: fields.email,
        subject: `Portfolio contact from ${fields.name}`,
        text: buildBody(fields),
      }),
    });
    if (response.ok) return true;
    // The visitor still gets the generic retry line; this is the only place the
    // provider's own reason exists. Read it with `wrangler tail`. A rejection
    // body carries addresses, never the key.
    console.error("resend rejected", response.status, await response.text());
    return false;
  } catch (error) {
    console.error("resend unreachable", error);
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // run_worker_first should mean this is the only path that arrives, but the
    // Worker is the thing on the network, so it states its own contract.
    if (url.pathname !== ROUTE) return new Response("Not found", { status: 404 });

    // Readiness. The dialog asks before it takes over its triggers, so an
    // unconfigured deploy leaves them as the mailto: links they already were
    // rather than opening a form whose submit could only fail.
    if (request.method === "GET" || request.method === "HEAD") {
      return json({ ok: true, ready: mailConfigured(env) }, 200);
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST" } });
    }

    // Same-origin only. Cheap, and it removes drive-by cross-site posting.
    if (request.headers.get("origin") !== ALLOWED_ORIGIN) return fail("forbidden", 403);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return fail("bad request", 400);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail("bad request", 400);

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return fail("bad request", 400);
    }
    if (!payload || typeof payload !== "object") return fail("bad request", 400);

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await withinRateLimits(env, ip))) return fail("too many requests", 429);

    const daily = await underDailyCap(env);
    if (!daily.allowed) return fail("too many requests", 429);

    // Honeypot and the timing check both answer 200 and send nothing. A bot
    // that is told it failed comes back; one that is told it succeeded does not.
    if (typeof payload.company === "string" && payload.company.trim() !== "") return ok();

    const elapsed = Date.now() - Number(payload.ts ?? 0);
    if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS) return ok();

    const fields = validate(payload);
    if (fields.error) return fail(fields.error, 400);

    // 503, not 502: nothing failed, the route is not open yet. The dialog reads
    // this status and hands its triggers back to the mailto: fallback.
    if (!mailConfigured(env)) {
      return json({ ok: false, error: "not configured", ready: false }, 503);
    }

    if (!(await send(env, fields))) return fail("send failed", 502);

    await bumpDailyCount(env, daily.key, daily.count);
    return ok();
  },
};
