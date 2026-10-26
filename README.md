# Goldmans Project Portfolio

Site: https://lipskiy13.github.io/Projects-management/

Pages:
- **Plan**: Jira GOLDMANS epics grouped by the "Блок" field (block / subgroup filters), with tasks and subtasks; list view and a Gantt view like the Jira timeline. Assignees are shown as initials avatars.
- **Backlog**: tasks under GOLDMANS-1075 Backlog / Ideas / Problems.
- **Efficiency report**: on-time rate in total, per assignee and per block. Hidden for now (`SHOW_REPORT = false` in `index.html`).

Other features:
- The **↻ Refresh** button loads live data from Jira through the Worker. Without the Worker it reloads the `data.json` snapshot.
- The **+ Idea** button creates a task in the epic GOLDMANS-1075 Backlog / Ideas / Problems.
- **Slack 💡**: react with :bulb: on any Slack message (in a channel where the `ideas` bot is a member) → the message becomes `[Idea] …` in GOLDMANS-1075. Reporter = the message author (matched by email), labels `from-slack` + `idea-by-<name>`, the bot marks the message ✅ and replies in the thread. One idea per message.

## Files
- `index.html` is the site.
- `data.json` is a snapshot of Jira data (epics, tasks, subtasks). The site shows it when the Worker is not connected.
- `worker/worker.js` is the Cloudflare Worker. It holds the Jira token, which can't be kept in a public site. It serves `GET /data` (live data), `POST /idea` (idea from the site) and `POST /slack` (Slack 💡 reactions).

## Connecting the Worker (free, about 10 minutes)
1. Go to dash.cloudflare.com → Workers & Pages → Create → Worker. Name it `goldmans-portfolio`, paste in the contents of `worker/worker.js`, and click Deploy.
2. Go to Worker → Settings → Variables and secrets and add:
   - `JIRA_EMAIL` (secret): the email of the Atlassian account.
   - `JIRA_TOKEN` (secret): an API token from https://id.atlassian.com/manage-profile/security/api-tokens
   - `ALLOWED_ORIGIN` (text): `https://lipskiy13.github.io`
3. Worker URL (already set in `index.html`): https://projects-management.kostya-508.workers.dev — deployed automatically by Cloudflare from this repo (`wrangler.toml`). Secrets must be in Settings → Variables and Secrets (runtime), not in Builds.

## Efficiency metric
% on time = tasks closed no later than their due date ÷ all tasks whose due date has already passed. The denominator counts tasks closed on time, tasks closed late, and overdue tasks that are still open. Tasks and subtasks with a due date are included. Tasks without a due date are left out.

## Slack 💡 → Jira (one-time setup)
1. api.slack.com/apps → **Create New App** → **From an app manifest** → pick the workspace → paste `slack/manifest.yml` → **Create**.
2. **Install to Workspace** → Allow.
3. Copy **OAuth & Permissions → Bot User OAuth Token** (`xoxb-…`) and **Basic Information → Signing Secret**.
4. Cloudflare → Worker `projects-management` → Settings → **Variables and Secrets** (runtime, not Builds) → add secrets `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` → Deploy.
5. Slack app → **Event Subscriptions** → if the Request URL is not "Verified", click **Retry**.
6. In every channel where ideas should be captured: `/invite @ideas`.
Optional: variable `IDEA_EMOJI` to use another emoji (name without colons, default `bulb`).
