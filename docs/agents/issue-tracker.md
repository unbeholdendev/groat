# Issue tracker: Forgejo

Issues and specs for this repo live as Forgejo issues on `git.unbeholden.dev`, repo `unbeholden/expense-tracker`. There is no CLI; use the `mcp__forgejo__*` tools for every operation.

## Conventions

- **Create an issue**: `create_issue` with title and body.
- **Read an issue**: `get_issue_by_index`, then `list_issue_comments` for comments.
- **List issues**: `list_repo_issues` with state and label filters, or `search_issues`.
- **Comment on an issue**: `create_issue_comment`.
- **Apply / remove labels**: `add_issue_labels` / `remove_issue_labels`. Create a missing label with `create_repo_label` first.
- **Close**: `create_issue_comment`, then `issue_state_change` to `closed`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues: `get_pull_request_by_index` and `get_pull_request_diff` to read, `list_repo_pull_requests` to list, and the issue comment and label tools to act (Forgejo PRs share the issue number space).

A bare `#42` may be an issue or a PR: try `get_pull_request_by_index` and fall back to `get_issue_by_index`.

## When a skill says "publish to the issue tracker"

Create a Forgejo issue.

## When a skill says "fetch the relevant ticket"

`get_issue_by_index` plus `list_issue_comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: Forgejo has no sub-issues. Add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Forgejo's native issue dependencies. Add an edge with `add_issue_dependency`; read with `list_issue_dependencies`. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (from its task list), drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `update_issue` to assign yourself (`get_my_user_info` for the username), the session's first write.
- **Resolve**: `create_issue_comment` with the answer, `issue_state_change` to `closed`, then append a context pointer (gist + link) to the map's Decisions-so-far.
