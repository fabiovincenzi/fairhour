---
title: API
description: The planned public REST API, personal access tokens and webhooks.
sidebar:
  label: Overview
  order: 1
  badge:
    text: Planned
    variant: caution
---

:::caution[In development]
The public API and its reference ship in v0.7 (Public API & Webhooks). This page describes what
is planned; nothing here can be called yet.
:::

Fairhour will have two API surfaces:

- **tRPC**, which serves the web app and the desktop companion. It is an internal contract and
  may change in any release, so do not build on it.
- A **public REST API**, versioned under `/api/v1`, which is the one for you.

## REST API

- Resources for **clients, projects, tasks, time entries, reports and invoice computations**.
- Described by an **OpenAPI 3.1** document generated from the same zod schemas that validate the
  data in the app, and served at `/api/v1/openapi.json`. The reference on this site will be
  rendered from it, with examples in curl and TypeScript.
- **Cursor pagination** and a consistent error format
  ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `problem+json`).
- **Rate limited** per token; the limits are configurable by whoever runs the instance (see the
  `RATE_LIMIT_API_*` variables in the
  [environment variable reference](/fairhour/self-hosting/environment-variables/)).

Money amounts are never JSON numbers: they travel as strings and are parsed exactly, as described
in [ADR-0003](/fairhour/adr/0003-money-representation/).

## Personal access tokens

You create tokens in your account settings.

- A token has a **scope** (read or write) and an optional **expiry**.
- It is **shown once**. Fairhour stores only a SHA-256 hash, plus the time it was last used, so a
  leaked database does not leak tokens.
- The desktop companion signs in to any Fairhour server with a token.

## Webhooks

Fairhour can notify your systems when something happens, for example `time_entry.created`,
`time_entry.updated` and `invoice.computed`.

- Each delivery is **signed** with an HMAC and carries a timestamp, so you can verify the sender
  and reject replays. The guide will document the exact scheme.
- Failed deliveries are **retried with backoff**, and a delivery log shows what happened.
- Webhook targets may not be private network addresses, which protects against server-side
  request forgery.

## What to read next

- [Architecture decision records](/fairhour/adr/): why the API is built this way.
- [Contributing](/fairhour/contributing/): the API is open source too.
