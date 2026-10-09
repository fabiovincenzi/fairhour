# Optional roadmap board (GitHub Projects v2)

The backlog lives in `.github/backlog/*.yml` and becomes issues and milestones automatically. A
Projects v2 board is an optional, nicer view of the same data.

## Create the board

1. Go to <https://github.com/users/fabiovincenzi/projects> → **New project** → *Roadmap* template.
2. Name it "Fairhour roadmap" and make it public.
3. Add fields: **Status** (Triage, Ready, In progress, Done), **Priority** (P0–P3), **Size**
   (S, M, L, XL), and group the roadmap view by **Milestone**.
4. Add a workflow in the project settings: "Item closed → Status: Done".
5. Add existing issues once: in the board, use **Add items** → search `repo:fabiovincenzi/fairhour is:issue`.

## Add new issues automatically

`.github/workflows/add-to-project.yml` adds every newly opened issue to the board, but only
when both of these exist (otherwise it is a successful no-op):

- secret `PROJECT_TOKEN`: a fine-grained or classic PAT with the `project` scope (and
  `repo`/issues read access), created by an account that can edit the board;
- variable `PROJECT_URL`: the board URL, e.g. `https://github.com/users/fabiovincenzi/projects/1`.

```bash
gh secret set PROJECT_TOKEN --repo fabiovincenzi/fairhour
gh variable set PROJECT_URL --repo fabiovincenzi/fairhour --body "https://github.com/users/fabiovincenzi/projects/1"
```

The `GITHUB_TOKEN` cannot write to user-owned projects, which is why a PAT is needed.
