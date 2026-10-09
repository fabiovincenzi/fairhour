# Architecture Decision Records

An Architecture Decision Record (ADR) is a short document that captures one significant
decision: the context it was made in, the options we considered, what we chose and what it
costs us. ADRs are how Fairhour remembers _why_ things are the way they are, so that
contributors, human or AI, neither reopen settled questions without new information nor undo
them by accident.

We use a lightweight variant of [MADR](https://adr.github.io/madr/). This directory is the source
of truth: the documentation site mirrors it, never the other way round.

## When to write one

Write an ADR when a decision is hard to reverse or crosses package boundaries. In line with
[GOVERNANCE.md](../../GOVERNANCE.md#decision-making), that includes:

- architecture and the public interfaces between packages (for example the `TaxPack` contract);
- licensing and contribution terms;
- adding a dependency with a large footprint, or replacing a tool chosen in an ADR;
- the data model, migrations and multi-tenancy;
- money, rounding and tax-engine conventions;
- breaking changes for self-hosters or API consumers.

You do not need one for routine dependency updates (Renovate handles those, including new majors
of a tool we already chose), refactors inside one package, or bug fixes.

## How to propose an ADR

1. Copy [`0000-template.md`](0000-template.md) to `NNNN-kebab-case-title.md`, using the next free
   number in the [index](#index). Numbers are never reused. If two open PRs pick the same number,
   the one merged second renumbers.
2. Fill it in with **Status: Proposed**. Write in English, keep it short, and link to issues and
   upstream docs instead of copying them.
3. Add a row to the index below.
4. Open a PR titled `docs: add ADR-NNNN <title>` (PR titles follow Conventional Commits),
   with signed-off commits ([DCO](../../CONTRIBUTING.md#developer-certificate-of-origin-dco)), and
   link the related issue or backlog ID.
5. Discuss in the PR. Decisions follow lazy consensus as described in
   [GOVERNANCE.md](../../GOVERNANCE.md#decision-making).
6. Once the decision is reached, set the status to **Accepted** (or **Rejected**), set the date,
   list the deciders, update the index row, and merge. Merge an ADR as Proposed only when a
   discussion needs to stay visible for longer than one PR.

## Status lifecycle

```text
Proposed ──► Accepted ──► Superseded by ADR-NNNN
    │            └──────► Deprecated
    └──────► Rejected
```

| Status                 | Meaning                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| Proposed               | Under discussion. Not binding yet.                                         |
| Accepted               | Binding. Code, docs, `CLAUDE.md` and agent instructions follow it.         |
| Rejected               | Considered and declined. Merged only when the reasoning is worth keeping.  |
| Deprecated             | No longer applies and has no replacement (for example, a removed feature). |
| Superseded by ADR-NNNN | Replaced, entirely or in the named sections, by a newer ADR.               |

Rules:

- **Accepted ADRs are records, not living documents.** Fix typos and broken links freely, but do
  not change a decision in place. Write a new ADR that supersedes it, then, in the same PR, set
  the old one's status to `Superseded by [ADR-NNNN](NNNN-title.md)`, add `Supersedes` to the new
  one and update both index rows. When only part of an ADR is replaced, name the section in both.
- **Keep the conventions in sync.** When an ADR changes how we work, the same PR updates
  [`CLAUDE.md`](../../CLAUDE.md), [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and, where relevant,
  `.claude/agents/*`, so that people and Claude Code sessions follow the current decision.
- The `architect` subagent drafts ADRs in AI-assisted sessions. Its ADRs go through the same
  review and approval as anyone else's.

## Index

| ADR                                     | Title                                                                 | Status   | Date       |
| --------------------------------------- | --------------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-technology-stack.md)        | Technology stack                                                      | Accepted | 2026-10-09 |
| [0002](0002-licensing.md)               | Licensing: AGPL-3.0 for the product, MIT for the libraries            | Accepted | 2026-10-09 |
| [0003](0003-money-representation.md)    | Money representation: bigint minor units and exact decimals           | Accepted | 2026-10-09 |
| [0004](0004-tax-engine-architecture.md) | Tax engine architecture: pure rule pipeline with versioned parameters | Accepted | 2026-10-09 |
| [0005](0005-time-zones-and-dates.md)    | Time zones and dates: UTC instants, local dates in the user's zone    | Accepted | 2026-10-09 |

Planned: the zod to OpenAPI generator for the public REST API (phase 7, API-002).
