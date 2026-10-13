# Local-development troubleshooting

This guide covers the setup problems that are easiest to hit while following the
[development setup](../../CONTRIBUTING.md). The repository's defaults are intended for a local
machine; do not reuse them for a production deployment.

## PostgreSQL cannot bind to port 5432

### Symptom

`docker compose up -d` fails with an error such as `port is already allocated` or `bind: address
already in use` for `127.0.0.1:5432`.

### Fix

Check whether another container or a local PostgreSQL service is using the port:

```bash
docker compose ps
docker ps
```

Stop the unrelated service, or change only the host side of the mapping in `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:5433:5432"
```

When using a different host port, update both `DATABASE_URL` and `TEST_DATABASE_URL` in `.env` to
use `5433`. The container still listens on port `5432`; only the host port changes.

## `pnpm` is not available after cloning

Fairhour pins pnpm through the `packageManager` field in the root `package.json`. Enable Corepack
from the repository root, then confirm that the activated version matches the pinned version:

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm --version
```

If `corepack enable` reports a permissions error, use a Node.js installation owned by your user or
ask your system administrator to enable Corepack. Do not install a second, unpinned pnpm version
just to bypass the repository's version check.

## Mailpit is not showing messages

Mailpit is the local SMTP inbox. Start it separately if the first compose start was interrupted:

```bash
docker compose up -d mailpit
docker compose ps mailpit
```

Open <http://localhost:8025> for the inbox. The application sends mail to `localhost:1025`, so the
development values in `.env` should be:

```dotenv
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
```

If the container is running but the inbox is still empty, inspect its startup output with
`docker compose logs mailpit` and confirm that the application was restarted after changing `.env`.

## Playwright cannot launch a browser

Install the browser binaries once after `pnpm install`, then run the end-to-end suite again:

```bash
pnpm exec playwright install
pnpm test:e2e
```

On Linux, if Playwright reports missing system libraries, install them with the supported helper:

```bash
pnpm exec playwright install --with-deps
```

The helper may require administrator privileges because it installs operating-system packages.

## Still blocked?

Include the exact command, the complete error message, your operating system, and the output of
`docker compose ps` in a [GitHub Discussion](https://github.com/fabiovincenzi/fairhour/discussions)
or a new issue. Never include `.env` contents, passwords, tokens, or other secrets.
