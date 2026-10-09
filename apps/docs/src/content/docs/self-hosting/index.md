---
title: Self-hosting
description: How you will run your own Fairhour instance with Docker Compose.
sidebar:
  label: Overview
  order: 1
  badge:
    text: Planned
    variant: caution
---

:::caution[In development]
The production container image and compose file, and this guide in full, arrive in v0.8
(Self-hosting & Releases). What follows is the planned shape; the environment variables below
already exist in the repository's `.env.example`.
:::

Fairhour is built to be run by you. A production instance is **one container plus
PostgreSQL 16**, with no dependency on a hosting vendor, and no data leaves your instance unless
you configure it: error reporting (a Sentry-compatible DSN) and tracing (an OpenTelemetry
endpoint) stay off while their variables are empty.

## What you need

- A machine with **Docker** and the Compose plugin.
- A **domain name** and a **reverse proxy** that terminates TLS (Caddy, Traefik or nginx; the
  guide will have a sample for each).
- An **SMTP server**, which sends the sign-in links.
- Optionally, a Google or GitHub OAuth app if you want those sign-in options.

## The planned flow

```bash
curl -O https://raw.githubusercontent.com/fabiovincenzi/fairhour/main/deploy/docker-compose.yml
curl -O https://raw.githubusercontent.com/fabiovincenzi/fairhour/main/.env.example
mv .env.example .env     # set BETTER_AUTH_SECRET, APP_URL, SMTP_* ...
docker compose up -d
```

The image is published to the GitHub Container Registry as `ghcr.io/fabiovincenzi/fairhour` for
`linux/amd64` and `linux/arm64`. It is built in several stages, runs as a non-root user and
carries an SBOM and build provenance. Set `MIGRATE_ON_BOOT=true` to apply database migrations
when the server starts (recommended for self-hosting).

## Configuration

Every setting is an environment variable. The
[environment variable reference](/fairhour/self-hosting/environment-variables/) lists all of them
with their defaults; it is generated from `.env.example`, so it is always current. The ones you
must set for a real instance:

| Variable                              | What to set                                                          |
| ------------------------------------- | -------------------------------------------------------------------- |
| `APP_URL`                             | The public `https://` URL of your instance, without a trailing slash |
| `DATABASE_URL`                        | The connection string of your PostgreSQL 16 database                 |
| `BETTER_AUTH_SECRET`                  | A long random secret: generate one with `openssl rand -base64 32`    |
| `SHARE_LINK_SECRET`                   | A second random secret, for signed report links                      |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | Your mail server, so that sign-in links reach people                 |

Keep the secrets stable: changing `BETTER_AUTH_SECRET` signs everybody out, and changing
`SHARE_LINK_SECRET` invalidates every share link.

## Keeping it safe

- Keep the image up to date.
- Set strong secrets and never reuse the placeholders from `.env.example`.
- Run behind TLS, and restrict access to the database.
- Report vulnerabilities privately, as described in the
  [security policy](/fairhour/contributing/security/).

## Still to come in this guide

Reverse proxy examples, email setup, backups and restores, upgrades, and troubleshooting
(v0.8).

## Running a modified version

Fairhour's web app is licensed under the AGPL-3.0. If you run a **modified** version for other
people, they must be able to get the source of your version. The app links to its source code;
point that link at your own repository. See the [license summary](/fairhour/license/).
