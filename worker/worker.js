// Cloudflare Worker: receives an idea from the portfolio site and creates a Jira task
// under the epic GOLDMANS-1075 (Backlog / Ideas / Problems).
//
// Secrets / variables (Cloudflare dashboard → Worker → Settings → Variables):
//   JIRA_EMAIL      – Atlassian account email used for the API (secret)
//   JIRA_TOKEN      – Atlassian API token, https://id.atlassian.com/manage-profile/security/api-tokens (secret)
//   TEAM_CODE       – shared code the team types in the form; blocks spam from the public site (secret)
//   ALLOWED_ORIGIN  – the site origin, e.g. https://<user>.github.io (plain variable)

const JIRA_SITE = "https://goldmans.atlassian.net";
const PROJECT_KEY = "GOLDMANS";
const ISSUE_TYPE_ID = "10038"; // "Задача"
const PARENT_EPIC = "GOLDMANS-1075";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

    let d;
    try { d = await request.json(); } catch { return reply(400, { error: "Invalid JSON" }); }

    if (d.website) return reply(200, { key: "OK" }); // honeypot: silently drop bots
    if (!env.TEAM_CODE || d.code !== env.TEAM_CODE) return reply(403, { error: "Wrong team code" });

    const clean = (v, max) => String(v || "").trim().slice(0, max);
    const summary = clean(d.summary, 200);
    const author = clean(d.author, 80);
    const description = clean(d.description, 5000);
    const kind = d.kind === "Problem" ? "Problem" : "Idea";
    if (!summary || !author) return reply(400, { error: "Title and name are required" });

    const para = text => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
    const body = {
      fields: {
        project: { key: PROJECT_KEY },
        issuetype: { id: ISSUE_TYPE_ID },
        parent: { key: PARENT_EPIC },
        summary: `[${kind}] ${summary}`,
        description: {
          type: "doc", version: 1,
          content: [
            ...(description ? description.split(/\n{2,}/).map(para) : []),
            para(`Submitted via portfolio site by ${author}.`),
          ],
        },
      },
    };

    const r = await fetch(`${JIRA_SITE}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${env.JIRA_EMAIL}:${env.JIRA_TOKEN}`),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return reply(502, { error: "Jira rejected the request", details: j.errors || j.errorMessages });
    return reply(200, { key: j.key });
  },
};
