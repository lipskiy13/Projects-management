# Goldmans Project Portfolio

Site: https://lipskiy13.github.io/Projects-management/

Pages (spec: `docs/SPEC.md`):
- **Plan**: projects (Jira epics with a "Блок") grouped by block and subgroup. Format dropdown List / Gantt. Filters: block, subgroup, people (multi-select), status (multi-select). KPIs follow the filters. Inline editing of status, start and end dates, and assignee; a side panel to edit title, description and block; buttons to create projects and tasks.
- **Backlog**: items of GOLDMANS-1075, with the total count only.
- **Periods**: week or month view of everything whose start–end range overlaps the period, plus carried-over unfinished items. Has a Statistics panel (A epics due, B tasks due, D % done, E % not done).
- **Efficiency**: the same A/B/D/E metrics over 6 months or 12 weeks, shifting by one period at a time.

Other features:
- The **↻ Refresh** button reloads live data from Jira through the Worker. If Jira is unreachable, the site falls back to the `data.json` snapshot, and editing is then unavailable.
- The **+ Idea** button creates a task in the epic GOLDMANS-1075.
- **Slack 💡**: react with :bulb: on any Slack message in a channel where the `ideas` bot is a member, and the message becomes `[Idea] …` in GOLDMANS-1075.

## Files
- `index.html` is the site.
- `data.json` is a snapshot of Jira data (epics, tasks, subtasks). The site shows it when the Worker is not connected.
- `worker/worker.js` is the Cloudflare Worker. It holds the Jira token, which can't be kept in a public site. Endpoints: `GET /data` (+ `meta` with users and block options), `GET /issue/:key`, `POST /update`, `POST /status`, `POST /create`, `POST /idea`, `POST /slack`, `GET /health`. Editing has no protection by design (this is a test site).

## Connecting the Worker (free, about 10 minutes)
1. Go to dash.cloudflare.com → Workers & Pages → Create → Worker. Name it `goldmans-portfolio`, paste in the contents of `worker/worker.js`, and click Deploy.
2. Go to Worker → Settings → Variables and secrets and add:
   - `JIRA_EMAIL` (secret): the email of the Atlassian account.
   - `JIRA_TOKEN` (secret): an API token from https://id.atlassian.com/manage-profile/security/api-tokens
   - `ALLOWED_ORIGIN` (text): `https://lipskiy13.github.io`
3. Worker URL (already set in `index.html`): https://projects-management.kostya-508.workers.dev — deployed automatically by Cloudflare from this repo (`wrangler.toml`). Secrets must be in Settings → Variables and Secrets (runtime), not in Builds.

## Slack 💡 → Jira (one-time setup)
1. api.slack.com/apps → **Create New App** → **From an app manifest** → pick the workspace → paste `slack/manifest.yml` → **Create**.
2. **Install to Workspace** → Allow.
3. Copy **OAuth & Permissions → Bot User OAuth Token** (`xoxb-…`) and **Basic Information → Signing Secret**.
4. Cloudflare → Worker `projects-management` → Settings → **Variables and Secrets** (runtime, not Builds) → add secrets `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` → Deploy.
5. Slack app → **Event Subscriptions** → if the Request URL is not "Verified", click **Retry**.
6. In every channel where ideas should be captured: `/invite @ideas`.
Optional: variable `IDEA_EMOJI` to use another emoji (name without colons, default `bulb`).
