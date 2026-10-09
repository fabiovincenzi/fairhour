# Contributing to Fairhour

Thank you for helping! Fairhour is built in the open and every contribution counts: code,
tax packs, translations, docs, design, bug reports and reviews. By participating you agree
to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

- 💬 Questions and ideas → [GitHub Discussions](https://github.com/fabiovincenzi/fairhour/discussions)
- 🐛 Bugs and feature requests → [issues](https://github.com/fabiovincenzi/fairhour/issues/new/choose)
- 🔒 Security problems → **never** in public issues; see [SECURITY.md](SECURITY.md)

## Development setup

Requirements: Node.js ≥ 22.18, pnpm (`corepack enable`), Docker (Postgres + Mailpit), and
optionally Rust stable for the desktop app.

```bash
git clone https://github.com/<you>/fairhour.git && cd fairhour
corepack enable
pnpm install                 # also installs git hooks (lefthook)
cp .env.example .env
docker compose up -d         # Postgres on :5432, Mailpit UI on :8025
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Useful commands:

| Command                     | What it does                                                    |
| --------------------------- | --------------------------------------------------------------- |
| `pnpm lint` / `pnpm format` | ESLint (strict type-checked) and Prettier                       |
| `pnpm typecheck`            | `tsc --noEmit` in every package                                 |
| `pnpm test`                 | Unit tests (Vitest) with coverage thresholds                    |
| `pnpm test:integration`     | Integration tests against Postgres                              |
| `pnpm test:e2e`             | Playwright E2E on desktop and mobile viewports, with axe checks |
| `pnpm i18n:check`           | Every locale has every English key                              |
| `pnpm knip`                 | Unused files, exports and dependencies                          |
| `pnpm changeset`            | Describe a user-facing change for the changelog                 |

## Workflow

1. **Pick an issue.** Look for [`good first issue`](https://github.com/fabiovincenzi/fairhour/labels/good%20first%20issue)
   or [`help wanted`](https://github.com/fabiovincenzi/fairhour/labels/help%20wanted) labels and
   items marked `status: ready`. Comment on the issue to say you are working on it, so nobody
   duplicates the effort. For anything large, discuss the approach first.
2. **Fork and branch**: `git switch -c feat/core-012-rounding` (`<type>/<backlog-id>-<slug>`).
3. **Code + tests.** Follow the conventions in [CLAUDE.md](CLAUDE.md#conventions) (they apply to
   humans too): strict TypeScript, zod at boundaries, no floats for money, UTC storage, i18n
   for every string, workspace-scoped data access.
4. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/) and a DCO
   sign-off: `git commit -s -m "feat(core): add 6-minute rounding"`.
5. **Changeset**: run `pnpm changeset` if your change affects users of a package or app.
6. **Open a PR** using the template. Keep it focused; link the issue with `Closes #N`.
   CI must be green and a maintainer must approve.

### Conventional Commits

`<type>(<scope>): <subject>`, where type is one of `feat`, `fix`, `docs`, `style`, `refactor`,
`perf`, `test`, `build`, `ci`, `chore`, `revert`, and scope is usually the package or app
(`web`, `desktop`, `api`, `db`, `core`, `money`, `tax-core`, `tax-pack-it`, `i18n`, `docs`, `ci`).
The PR title must follow the same format because PRs are squash-merged.

### Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/) instead of a CLA. Every commit must contain
a `Signed-off-by: Your Name <you@example.com>` line matching the commit author, which certifies
that you wrote the patch or have the right to submit it under the project's licenses. Add it
with `git commit -s`. Forgot? Fix the last commit with `git commit --amend -s --no-edit`, or a
whole branch with `git rebase --signoff main`, then force-push **your own** branch.

## Adding a tax pack for your country

Tax packs are the heart of Fairhour, and the best way to make it useful where you live.
Follow the step-by-step guide in [docs/contributing/tax-packs.md](docs/contributing/tax-packs.md):
copy `packages/tax-pack-template`, model the configuration, implement each rule with its legal
source, add golden fixtures and make the shared conformance suite pass. Open a
[tax pack request](https://github.com/fabiovincenzi/fairhour/issues/new?template=tax_pack_request.yml)
first so we can agree on the scope.

## Adding or improving a translation

English is the source locale. Translations live in `apps/web/messages/<locale>.json` (and
`apps/desktop/messages/<locale>.json`). See [docs/contributing/translations.md](docs/contributing/translations.md):
copy `en.json`, translate the values (never the keys), keep ICU placeholders like `{count}`, and
run `pnpm i18n:check`. Open a [translation request](https://github.com/fabiovincenzi/fairhour/issues/new?template=translation_request.yml)
to coordinate with other translators.

## Reviews and merging

- PRs need one maintainer approval and green checks (CI, DCO, PR title).
- We squash-merge; the PR title becomes the commit message.
- Be kind and specific in reviews; prefer suggestions over demands.

## AI-assisted contributions

Much of Fairhour is developed with Claude Code, and the repository ships the configuration it
uses (`CLAUDE.md`, `.claude/agents`, `.claude/commands`). AI-assisted contributions are welcome
under the same rules as any other: you are responsible for the code you submit, it must be
tested and reviewed, and the DCO sign-off is yours.

## Recognition

We use [all-contributors](https://allcontributors.org/) to credit every kind of contribution in
the README. A maintainer will add you after your first merged contribution, or you can comment
`@all-contributors please add @you for code, doc` on your PR.
