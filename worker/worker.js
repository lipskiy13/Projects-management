// Cloudflare Worker for the Goldmans portfolio site.
//   GET  /data  – live data from Jira (epics + tasks + subtasks) in the same format as data.json
//   POST /idea  – creates a task under the epic GOLDMANS-1075 (Backlog / Ideas / Problems)
//   POST /slack – Slack Events API: a :bulb: reaction on a Slack message turns it into an idea in GOLDMANS-1075
//
// Secrets / variables (Cloudflare dashboard → Worker → Settings → Variables and secrets):
//   JIRA_EMAIL      – Atlassian account email used for the API (secret)
//   JIRA_TOKEN      – Atlassian API token, https://id.atlassian.com/manage-profile/security/api-tokens (secret)
//   ALLOWED_ORIGIN  – the site origin, e.g. https://lipskiy13.github.io (plain text)
//   SLACK_BOT_TOKEN      – Slack app "Bot User OAuth Token", xoxb-… (secret)
//   SLACK_SIGNING_SECRET – Slack app "Signing Secret" (secret)
//   IDEA_EMOJI           – optional, emoji name without colons (default "bulb" = 💡)

const JIRA_SITE = "https://goldmans.atlassian.net";
const PROJECT_KEY = "GOLDMANS";
const ISSUE_TYPE_ID = "10038";        // "Задача"
const PARENT_EPIC = "GOLDMANS-1075";
const F_START = "customfield_10015";  // "Дата начала"
const F_BLOCK = "customfield_10524";  // "Блок" (cascading)

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    const auth = "Basic " + btoa(`${env.JIRA_EMAIL}:${env.JIRA_TOKEN}`);
    const path = new URL(request.url).pathname.replace(/\/$/, "");

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (request.method === "POST" && path === "/slack") return await slackEvents(request, env, ctx, auth);
      if (request.method === "GET" && path === "/health") return reply(200, await health(auth, env));
      if (request.method === "GET" && path === "/data") return reply(200, await loadData(auth, env));
      if (request.method === "POST" && (path === "/idea" || path === "")) return await createIdea(request, env, auth, reply);
      return reply(404, { error: "Not found" });
    } catch (e) {
      return reply(502, { error: String(e.message || e) });
    }
  },
};

// ---------- GET /data -----------------------------------------------------------
async function search(auth, jql, fields) {
  const out = [];
  let nextPageToken;
  do {
    const r = await fetch(`${JIRA_SITE}/rest/api/3/search/jql`, {
      method: "POST",
      headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ jql, fields, maxResults: 100, nextPageToken }),
    });
    if (!r.ok) throw new Error(`Jira search failed: ${r.status}`);
    const j = await r.json();
    out.push(...j.issues);
    nextPageToken = j.isLast ? undefined : j.nextPageToken;
  } while (nextPageToken);
  return out;
}

const CAT = { new: "todo", indeterminate: "prog", done: "done" };
function base(i) {
  const f = i.fields;
  return {
    k: i.key, s: f.summary, st: CAT[f.status?.statusCategory?.key] || "todo",
    a: f.assignee?.displayName || null, sd: f[F_START] || null, dd: f.duedate || null,
    rd: f.resolutiondate ? f.resolutiondate.slice(0, 10) : null,
  };
}

async function loadData(auth, env) {
  if (!env.JIRA_EMAIL || !env.JIRA_TOKEN) throw new Error("JIRA_EMAIL / JIRA_TOKEN secrets are not set in Cloudflare");
  const me = await fetch(`${JIRA_SITE}/rest/api/3/myself`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!me.ok) throw new Error(`Jira did not accept JIRA_EMAIL / JIRA_TOKEN (HTTP ${me.status})`);
  const all = await search(auth, `project = ${PROJECT_KEY} ORDER BY key ASC`,
    ["summary", "status", "assignee", "duedate", "resolutiondate", F_START, F_BLOCK, "parent", "issuetype"]);
  const isEpic = i => i.fields.issuetype?.hierarchyLevel === 1;
  return {
    generated: new Date().toISOString(),
    epics: all.filter(isEpic).map(e => ({ ...base(e), b: e.fields[F_BLOCK]?.value || null, g: e.fields[F_BLOCK]?.child?.value || null })),
    issues: all.filter(i => !isEpic(i)).map(i => ({ ...base(i), p: i.fields.parent?.key || null, t: i.fields.issuetype?.subtask ? "sub" : "task" })),
  };
}

// ---------- POST /idea ----------------------------------------------------------
async function createIdea(request, env, auth, reply) {
  let d;
  try { d = await request.json(); } catch { return reply(400, { error: "Invalid JSON" }); }

  if (d.website) return reply(200, { key: "OK" }); // honeypot: silently drop bots
  const AUTHORS = ["Ilya", "Kostya", "Liza", "Mark", "Misha"];
  if (!AUTHORS.includes(d.author)) return reply(400, { error: "Choose your name from the list" });

  const clean = (v, max) => String(v || "").trim().slice(0, max);
  const summary = clean(d.summary, 200);
  const author = clean(d.author, 80);
  const description = clean(d.description, 5000);
  const kind = d.kind === "Problem" ? "Problem" : "Idea";
  if (!summary) return reply(400, { error: "Title is required" });

  const para = text => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
  const body = {
    fields: {
      project: { key: PROJECT_KEY },
      issuetype: { id: ISSUE_TYPE_ID },
      parent: { key: PARENT_EPIC },
      summary: `[${kind}] ${summary}`,
      description: {
        type: "doc", version: 1,
        content: [...(description ? description.split(/\n{2,}/).map(para) : []), para(`Submitted via portfolio site by ${author}.`)],
      },
    },
  };
  const r = await fetch(`${JIRA_SITE}/rest/api/3/issue`, {
    method: "POST",
    headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return reply(502, { error: "Jira rejected the request", details: j.errors || j.errorMessages });
  return reply(200, { key: j.key });
}

// ---------- GET /health (diagnostics, no secrets in the output) -----------------
async function health(auth, env) {
  const out = { emailSet: !!env.JIRA_EMAIL, tokenSet: !!env.JIRA_TOKEN, tokenLength: (env.JIRA_TOKEN || "").length,
                emailLooksLike: env.JIRA_EMAIL ? env.JIRA_EMAIL.replace(/^(.).*(@.*)$/, "$1…$2") : null };
  try {
    const me = await fetch(`${JIRA_SITE}/rest/api/3/myself`, { headers: { Authorization: auth, Accept: "application/json" } });
    out.myselfStatus = me.status;
    if (me.ok) out.jiraUser = (await me.json()).displayName; else out.myselfError = (await me.text()).slice(0, 200);
  } catch (e) { out.myselfError = String(e); }
  return out;
}

// ---------- POST /slack (Slack Events API) --------------------------------------
// Flow: someone adds the IDEA_EMOJI reaction to a message → the Worker reads the message,
// creates "[Idea] <first line>" under GOLDMANS-1075 with the message author as Reporter,
// marks the message with ✅ (also the lock that prevents duplicates) and replies in the thread.
const LOCK_EMOJI = "white_check_mark";

async function slackEvents(request, env, ctx, auth) {
  const raw = await request.text();
  let body;
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  // URL verification is allowed before the signing secret is configured (it is only known after the app exists).
  if (body.type === "url_verification" && !env.SLACK_SIGNING_SECRET)
    return new Response(body.challenge, { headers: { "Content-Type": "text/plain" } });
  if (!(await slackSignatureOk(request, raw, env.SLACK_SIGNING_SECRET))) return new Response("bad signature", { status: 401 });
  if (body.type === "url_verification") return new Response(body.challenge, { headers: { "Content-Type": "text/plain" } });

  // Slack resends events it thinks were not acknowledged; the ✅ lock makes repeats harmless, but skip them anyway.
  if (request.headers.get("X-Slack-Retry-Num")) return new Response("ok");

  const ev = body.event || {};
  const emoji = (env.IDEA_EMOJI || "bulb").replace(/:/g, "");
  if (body.type === "event_callback" && ev.type === "reaction_added" && ev.reaction === emoji && ev.item?.type === "message") {
    const job = handleIdeaReaction(ev, env, auth).catch(e => console.log("slack idea failed", e && e.stack || e));
    if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
  }
  return new Response("ok");   // must answer Slack within 3 s
}

async function slackSignatureOk(request, raw, secret) {
  if (!secret) return false;
  const ts = request.headers.get("X-Slack-Request-Timestamp") || "";
  const sig = request.headers.get("X-Slack-Signature") || "";
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${raw}`));
  const expected = "v0=" + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function slack(env, method, params, http = "POST") {
  const url = `https://slack.com/api/${method}`;
  const headers = { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` };
  const r = http === "GET"
    ? await fetch(url + "?" + new URLSearchParams(params), { headers })
    : await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(params) });
  return r.json();
}

async function getSlackMessage(env, channel, ts) {
  const h = await slack(env, "conversations.history", { channel, latest: ts, oldest: ts, inclusive: "true", limit: "1" }, "GET");
  if (h.ok && h.messages?.length && h.messages[0].ts === ts) return h.messages[0];
  const r = await slack(env, "conversations.replies", { channel, ts, latest: ts, oldest: ts, inclusive: "true", limit: "50" }, "GET");
  if (r.ok) return (r.messages || []).find(m => m.ts === ts) || null;
  throw new Error(`cannot read message: ${h.error || r.error}`);
}

// Slack mrkdwn → plain text
function slackPlain(text, names = {}) {
  return String(text || "")
    .replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id) => "@" + (names[id] || id))
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<!(here|channel|everyone)[^>]*>/g, "@$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .trim();
}

async function jiraAccountIdByEmail(auth, email) {
  if (!email) return null;
  const r = await fetch(`${JIRA_SITE}/rest/api/3/user/search?query=${encodeURIComponent(email)}`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!r.ok) return null;
  const list = await r.json();
  const hit = list.find(u => (u.emailAddress || "").toLowerCase() === email.toLowerCase()) || (list.length === 1 ? list[0] : null);
  return hit?.accountId || null;
}

async function handleIdeaReaction(ev, env, auth) {
  const channel = ev.item.channel, ts = ev.item.ts;

  // Lock: the bot's own ✅ on the message. Slack refuses a second identical reaction → no duplicates.
  const lock = await slack(env, "reactions.add", { channel, timestamp: ts, name: LOCK_EMOJI });
  if (!lock.ok) { if (lock.error !== "already_reacted") console.log("reactions.add failed", lock.error); return; }

  try {
    const msg = await getSlackMessage(env, channel, ts);
    if (!msg) throw new Error("message not found");
    const authorId = msg.user || null;
    const [author, reactor, link] = await Promise.all([
      authorId ? slack(env, "users.info", { user: authorId }, "GET") : Promise.resolve({}),
      ev.user && ev.user !== authorId ? slack(env, "users.info", { user: ev.user }, "GET") : Promise.resolve({}),
      slack(env, "chat.getPermalink", { channel, message_ts: ts }, "GET"),
    ]);
    const aName = author.user?.profile?.real_name || author.user?.real_name || author.user?.name || msg.username || "unknown";
    const aEmail = author.user?.profile?.email || null;
    const rName = reactor.user?.profile?.real_name || reactor.user?.real_name || null;

    const ids = [...new Set([...String(msg.text || "").matchAll(/<@([A-Z0-9]+)/g)].map(m => m[1]))].slice(0, 8);
    const names = Object.fromEntries(await Promise.all(ids.map(async id => {
      const u = await slack(env, "users.info", { user: id }, "GET");
      return [id, u.user?.profile?.real_name || u.user?.real_name || u.user?.name || id];
    })));
    const text = slackPlain(msg.text, names) || "(no text)";
    const firstLine = text.split(/\n/).find(l => l.trim()) || text;
    const summary = "[Idea] " + (firstLine.length > 150 ? firstLine.slice(0, 147) + "…" : firstLine);
    const para = t => ({ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] });
    const linkPara = url => ({ type: "paragraph", content: [{ type: "text", text: "Slack message", marks: [{ type: "link", attrs: { href: url } }] }] });
    const content = [
      ...text.split(/\n{2,}/).map(para),
      para(`Submitted via Slack by ${aName}${rName ? ` (captured with :${(env.IDEA_EMOJI || "bulb").replace(/:/g, "")}: by ${rName})` : ""}.`),
      ...(link.ok && link.permalink ? [linkPara(link.permalink)] : []),
    ];
    const tag = "idea-by-" + (aName.split(/\s+/)[0] || "unknown").toLowerCase().replace(/[^a-z0-9а-яё_-]/gi, "");
    const fields = {
      project: { key: PROJECT_KEY }, issuetype: { id: ISSUE_TYPE_ID }, parent: { key: PARENT_EPIC },
      summary, labels: ["from-slack", tag], description: { type: "doc", version: 1, content },
    };
    const accountId = await jiraAccountIdByEmail(auth, aEmail);
    const create = f => fetch(`${JIRA_SITE}/rest/api/3/issue`, {
      method: "POST", headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ fields: f }),
    });
    let r = accountId ? await create({ ...fields, reporter: { accountId } }) : await create(fields);
    if (!r.ok && accountId) r = await create(fields);   // no permission to set Reporter → fall back
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Jira: " + JSON.stringify(j.errors || j.errorMessages || r.status));

    await slack(env, "chat.postMessage", {
      channel, thread_ts: msg.thread_ts || ts, unfurl_links: false,
      text: `:bulb: Idea saved to Jira: <${JIRA_SITE}/browse/${j.key}|${j.key}> (author: ${aName})`,
    });
  } catch (e) {
    await slack(env, "reactions.remove", { channel, timestamp: ts, name: LOCK_EMOJI });   // allow a retry
    if (ev.user) await slack(env, "chat.postEphemeral", { channel, user: ev.user, text: `Could not save the idea to Jira: ${String(e.message || e).slice(0, 300)}` });
    throw e;
  }
}
