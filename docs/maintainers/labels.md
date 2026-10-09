# Labels

Labels are defined in [`.github/labels.yml`](../../.github/labels.yml) and synced by the
`sync-backlog` workflow. Never create labels by hand; add them to the file.

| Group | Labels | Rule |
|---|---|---|
| Type | `type: bug`, `feature`, `docs`, `chore`, `refactor`, `security`, `epic` | Exactly one |
| Area | `area: web`, `desktop`, `api`, `db`, `core`, `tax-core`, `tax-pack-it`, `tax-packs`, `i18n`, `docs`, `infra`, `ui`, `reports` | One or more |
| Priority | `P0` critical, `P1` high, `P2` medium, `P3` low | Exactly one once triaged |
| Status | `status: triage`, `ready`, `blocked`, `in-progress` | Exactly one while open |
| Size | `size: S` (hours), `M` (1–3 days), `L` (a week), `XL` (split it) | Exactly one once triaged |
| Community | `good first issue`, `help wanted`, `tax-pack-request`, `translation` | Optional |
| Housekeeping | `pinned`, `stale`, `dependencies`, `first-time contributor`, `needs-dco`, `duplicate`, `wontfix`, `question` | As needed |

## Conventions

- `good first issue` items are `size: S` or `M`, self-contained, and link the docs needed.
- `type: security` is for hardening work. Vulnerabilities are reported privately, never as issues.
- `type: epic` issues track sub-issues through a task list; they close when every sub-issue is done.
- `status: in-progress` means someone is actively working on it; assign yourself too.
- `pinned` exempts an issue from the stale policy and the thread lock.
