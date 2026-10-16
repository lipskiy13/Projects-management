# Goldmans Project Portfolio

Site: https://lipskiy13.github.io/Projects-management/

The site has two pages:
- **План** (Plan): the Jira GOLDMANS epics grouped by the "Блок" field, with their tasks and subtasks. It has a list view and a Gantt view styled like the Jira timeline.
- **Отчёт по эффективности** (Efficiency report): the share of tasks closed on time, in total, per assignee and per block.

Other features:
- The **↻ Обновить** (Refresh) button loads live data from Jira through the Worker. Without the Worker it reloads the `data.json` snapshot.
- The **+ Идея** (Idea) button creates a task in the epic GOLDMANS-1075 Backlog / Ideas / Problems.

## Files
- `index.html` is the site.
- `data.json` is a snapshot of Jira data (epics, tasks, subtasks). The site shows it when the Worker is not connected.
- `worker/worker.js` is the Cloudflare Worker. It holds the Jira token, which can't be kept in a public site. It serves `GET /data` for live data and `POST /idea` to create an idea.

## Connecting the Worker (free, about 10 minutes)
1. Go to dash.cloudflare.com → Workers & Pages → Create → Worker. Name it `goldmans-portfolio`, paste in the contents of `worker/worker.js`, and click Deploy.
2. Go to Worker → Settings → Variables and secrets and add:
   - `JIRA_EMAIL` (secret): the email of the Atlassian account.
   - `JIRA_TOKEN` (secret): an API token from https://id.atlassian.com/manage-profile/security/api-tokens
   - `TEAM_CODE` (secret): a code word for the team, used to protect the idea form from spam.
   - `ALLOWED_ORIGIN` (text): `https://lipskiy13.github.io`
3. Put the Worker URL (`https://goldmans-portfolio.<subdomain>.workers.dev`) into `WORKER_URL` in `index.html`.

## Efficiency metric
% on time = tasks closed no later than their due date ÷ all tasks whose due date has already passed. The denominator counts tasks closed on time, tasks closed late, and overdue tasks that are still open. Tasks and subtasks with a due date are included. Tasks without a due date are left out.
