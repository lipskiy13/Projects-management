# Goldmans Projects site — spec v2 (26 Oct 2026)

A test site; it will later move into the company's personal cabinet. Public, **no edit protection** (by decision). All edits go to Jira through the Worker as the Worker's Jira account. Changes are pushed straight to `main` for this repo.

## Scope and data rules (apply everywhere)
- **Projects** = Jira epics that have a "Блок" value. Excluded everywhere: epics without a block (GOLDMANS-748/749/750) and the backlog epic GOLDMANS-1075 (Backlog page only). Tasks without an epic are not shown in Plan / Periods / Efficiency.
- **Tasks** = issues of type Task under an epic. Subtasks are shown nested in List but are **not counted** in any metric and cannot be created.
- **Done** = status category Done ("Готово"). **Planned** = not done (To do + In progress).
- **People list** (filters and assignee pickers): Ilya, Kostya, Liza, Mark, Misha, plus "Unassigned". Iurii is removed from the lists. When every option is selected, nothing is filtered.
- **Sorting**: epics within a subgroup, tasks within an epic and subtasks within a task are sorted by end date ascending, with no date last, then by key. This applies to List, Gantt and Periods.
- **Rate colours**: 80% or more is green, 50–79% is amber, below 50% is red. For the "% not done" metric the colour scale is inverted.

## Shared filters (Plan, Periods; Efficiency uses Block, Subgroup, People)
- Block: dropdown. Subgroup: dropdown, depends on the block.
- People: multi-select dropdown with checkboxes. All are selected by default. It has "Select all" and "Clear" buttons.
- Status: multi-select dropdown in the same format.
- Matching: an item matches when its assignee and its status are both selected. An epic is shown if the epic matches **or** it has at least one matching task. Inside an epic only matching tasks are shown.

## Editing (no protection)
- Inline in List, Periods and Backlog:
  - status dropdown (To do / In progress / Done) → Jira transition;
  - start date and end date inputs;
  - assignee picker (click the avatar).
- Side panel on the right, like Jira (click the title of an epic or task):
  - title, description (plain text; Jira formatting is simplified on save), status, assignee, start date, end date;
  - block and subgroup: editable for epics; for tasks shown read-only from the parent epic;
  - an epic's panel lists its tasks (click to open) and has "+ Add task";
  - a task's panel links back to its epic.
- Create:
  - "+ New project" creates an epic with title, description, block/subgroup, assignee, start date, end date;
  - "+ Add task" inside an epic creates a Task with title, description, assignee, start date, end date.

## Pages (tabs in this order)
1. **Plan**
   - Format dropdown: List / Gantt. Gantt also has a zoom dropdown (Weeks / Months / Quarters).
   - List shows separate **Start** and **End** columns instead of a date range.
   - KPIs, recalculated by the filters:
     - Epics total / done / planned;
     - % done of epics whose end date ≤ today (highlighted);
     - Tasks total / done / planned;
     - % done of tasks whose end date ≤ today (highlighted);
     - % of epics with no tasks;
     - average tasks per epic.
2. **Backlog**
   - Only one KPI: the total number of items.
   - List of GOLDMANS-1075 items, newest first, with inline editing and the side panel.
   - "+ Add an idea" button.
3. **Periods**
   - Week / Month switch. A week runs Monday to Sunday.
   - ‹ › arrows and a "Today" button to move between periods.
   - Shows epics and tasks whose range [start (or end, when there is no start) … end] overlaps the period by at least one day. Items with no end date are not shown.
   - Also shows **all** not-done items whose end date is before the period start, marked "Carried over".
   - Same filters, editing and side panel as List. Same block → subgroup → epic → task structure.
   - A "Statistics" button opens a panel for the selected period and the Block / Subgroup / People filters:
     - A) epics with an end date in the period;
     - B) tasks with an end date in the period;
     - D) % of B that are done;
     - E) % of B not done.
     - Carried-over items are excluded.
4. **Efficiency**
   - A table with periods as columns and metrics A, B, D, E as rows. D and E are coloured.
   - Month mode shows 6 months, week mode shows 12 weeks. By default the current period is the last column.
   - ‹ › shift the window by **1 period**; the number of columns stays the same.
   - Filters: People, Block, Subgroup.
   - The old "% on time" report is removed.

## Worker API (Cloudflare)
- `GET /data` returns epics and issues (now including the assignee accountId) plus `meta`:
  - `meta.users`: assignable users;
  - `meta.blocks`: block → subgroup options with their ids.
- `GET /issue/:key` returns the title, the description as plain text, and the fields.
- `POST /update` `{key, s?, desc?, aid?, sd?, dd?, block?}` edits an issue's fields.
- `POST /status` `{key, to}` moves an issue to the target status through a Jira transition.
- `POST /create` `{type: epic|task, parent?, s, desc?, aid?, sd?, dd?, block?}` returns `{key}`.
- The existing endpoints stay: `/idea`, `/slack`, `/health`.
