# Goldmans Project Portfolio

A static page (GitHub Pages) showing the Jira GOLDMANS epics grouped by the "Блок" field, plus a form that adds ideas as tasks under the epic **GOLDMANS-1075 Backlog / Ideas / Problems**.

- `index.html` is the site. The project data is a snapshot from 16 Oct 2026, embedded in the `BLOCKS` constant.
- `worker/worker.js` is a Cloudflare Worker. It holds the Jira token and creates the tasks. A token can't be kept in a public static site, so it lives here instead.

## 1. Publish the site (GitHub Pages)
1. Push this repository to GitHub.
2. Go to Settings → Pages → Source and choose "Deploy from a branch", branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/goldmans-portfolio/`.

## 2. Connect the idea form (Cloudflare Worker, free)
1. Go to dash.cloudflare.com → Workers & Pages → Create → Worker. Name it, for example, `goldmans-ideas`. Paste in the contents of `worker/worker.js` and deploy.
2. Go to the Worker → Settings → Variables and secrets, and add:
   - `JIRA_EMAIL` (secret): the email of the Atlassian account that will create the tasks.
   - `JIRA_TOKEN` (secret): an API token from https://id.atlassian.com/manage-profile/security/api-tokens
   - `TEAM_CODE` (secret): a code word for the team. The site is public, and this code keeps spam out.
   - `ALLOWED_ORIGIN` (text): `https://<user>.github.io`
3. Copy the Worker URL (`https://goldmans-ideas.<subdomain>.workers.dev`) into `IDEA_ENDPOINT` in `index.html`, then commit.
4. Test: send an idea from the site. A task named `[Idea] …` should appear in GOLDMANS-1075.

## Updating the data
Ask Claude to refresh the snapshot. It re-reads the epics from Jira and updates `BLOCKS` in `index.html`.
