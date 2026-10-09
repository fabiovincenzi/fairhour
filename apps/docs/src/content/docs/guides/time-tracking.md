---
title: Time tracking
description: How tracking time will work in Fairhour, from the timer and manual entries to quick add, rounding and keyboard shortcuts.
sidebar:
  order: 1
  badge:
    text: Planned
    variant: caution
---

:::caution[In development]
This guide describes the planned behavior. The calculations ship in v0.2 (Core & Tax Engine) and
the web app in v0.4 (Web MVP). Details may change before then.
:::

## Organize your work

Everything lives in a **workspace**. A workspace holds **clients**, a client holds **projects**,
and a project holds **tasks**. Time is recorded against a project (and optionally a task), so
that rates, rounding and budgets can be set at the level where they make sense.

Members of a workspace have one of four roles: **owner**, **admin**, **member** or **viewer**.
Owners manage the billing-relevant settings, admins manage members and projects, members track
time, and viewers read reports. Changes to time entries, rates, tax profiles and invoices are
written to an audit log (coming in v0.3).

## The timer

- One running timer per user. Starting a new one stops the running one.
- It survives page reloads, and it stays in sync across browser tabs and across your devices.
- The page title shows the running time, so you can see it from another tab.

## Manual entries

Add an entry for any start and end, or a duration. Entries have a description, tags, a
**billable** flag and notes. You can edit, **split** and **merge** entries without losing time:
splitting at a point and merging the halves gives back the original entry. Fairhour highlights
**overlapping** entries so you can fix double bookings.

The entries list groups entries by day in your time zone, and a week calendar lets you drag to
create an entry or resize one.

## Quick add

Type what you did in plain language and Fairhour turns it into an entry, showing a preview of the
parsed project, duration and date before you save:

| You type                                | You get                                               |
| --------------------------------------- | ----------------------------------------------------- |
| `2h design Acme yesterday`              | 2 hours, description "design", client Acme, yesterday |
| `1h30m call with Bob @Website #meeting` | 1 h 30 min, project Website, tag `meeting`            |
| `9:00-10:15 standup`                    | An entry from 09:00 to 10:15                          |

Durations (`2h`, `1.5h`, `90m`, `1h30`), time ranges and dates (today, yesterday, weekdays, ISO
dates) are understood. Clients and projects are matched by name, `@project` and `#tag` pick a
project and a tag, and the rest becomes the description. The keywords exist in English and in
Italian (`oggi`, `ieri`).

## Rounding

Each project can round billable time: **none**, or to **6, 15 or 30 minutes**, in the direction
you choose (up, to the nearest, or down).

## Time zones

Timestamps are stored in UTC and shown in your time zone. Days, weeks and months in reports are
those of your time zone, correct across daylight saving changes, and an entry that crosses
midnight is split across the days it covers in reports.

## Keyboard shortcuts

Press <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>K</kbd> on macOS) for the command palette.
<kbd>s</kbd> starts or stops the timer, <kbd>n</kbd> opens a new entry, and <kbd>?</kbd> lists
every shortcut.

## Next

[Rates and budgets](/fairhour/guides/rates-and-budgets/) explains how an entry becomes an amount.
