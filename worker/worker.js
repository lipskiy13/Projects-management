// Cloudflare Worker for the Goldmans portfolio site.
//   GET  /data  – live data from Jira (epics + tasks + subtasks) in the same format as data.json
//   POST /idea  – creates a task under the epic GOLDMANS-1075 (Backlog / Ideas / Problems)
//
// Secrets / variables (Cloudflare dashboard → Worker → Settings → Variables and secrets):
//   JIRA_EMAIL      – Atlassian account email used for the API (secret)
//   JIRA_TOKEN      – Atlassian API token, https://id.atlassian.com/manage-profile/security/api-tokens (secret)
//   ALLOWED_ORIGIN  – the site origin, e.g. https://lipskiy13.github.io (plain text)

const JIRA_SITE = "https://goldmans.atlassian.net";
const PROJECT_KEY = "GOLDMANS";
const ISSUE_TYPE_ID = "10038";        // "Задача"
const PARENT_EPIC = "GOLDMANS-1075";
const F_START = "customfield_10015";  // "Дата начала"
const F_BLOCK = "customfield_10524";  // "Блок" (cascading)

export default {
  async fetch(request, env) {
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
