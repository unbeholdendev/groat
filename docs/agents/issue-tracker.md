# Issue tracker: Forgejo

Issues and specs for this repo live as Forgejo issues on `git.home.unbeholden.dev`, repo `unbeholden/expense-tracker`. Use `tea` for every operation, from inside the repo, and `tea api <path>` for what it lacks.

## Conventions

- **Create an issue**: `tea issues create --title <title> --description-file <file>`.
- **Read an issue**: `tea issues <index>`, then `tea api repos/unbeholden/expense-tracker/issues/<index>/comments` for comments.
- **List issues**: `tea issues list --state <state> --labels <names>`.
- **Comment on an issue**: `tea comment <index> <body>`.
- **Apply / remove labels**: `tea issues edit <index> --add-labels <names>` / `--remove-labels <names>`. Create a missing label with `tea labels create --name <name> --color <hex>` first.
- **Close**: `tea comment`, then `tea issues close <index>`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues: `tea api repos/unbeholden/expense-tracker/pulls/<index>` to read, with `.diff` on that path for the diff, `tea pr list` to list, and the issue comment and label commands to act (Forgejo PRs share the issue number space).

A bare `#42` may be an issue or a PR: `tea api` on `pulls/42` returns 404 for an issue.

## When a skill says "publish to the issue tracker"

Create a Forgejo issue.

## When a skill says "fetch the relevant ticket"

`tea issues <index>` plus `tea api` on its `comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: Forgejo has no sub-issues. Add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Forgejo's native issue dependencies, through `tea api` on `repos/unbeholden/expense-tracker/issues/<index>/dependencies`: `GET` to read, `POST` to add. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (from its task list), drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `tea issues edit <index> --add-assignees <username>` (`tea whoami` for the username), the session's first write.
- **Resolve**: `tea comment` with the answer, `tea issues close`, then append a context pointer (gist + link) to the map's Decisions-so-far.
