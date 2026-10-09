---
title: Rates and budgets
description: How Fairhour will decide what an hour is worth, how fixed prices and day rates work, and how budget alerts behave.
sidebar:
  order: 2
  badge:
    text: Planned
    variant: caution
---

:::caution[In development]
This guide describes the planned behavior. The calculations ship in v0.2 (Core & Tax Engine) and
the screens in v0.4 (Web MVP). Details may change before then.
:::

## Which rate applies

You can set an hourly rate at four levels. Fairhour uses the most specific one:

1. the **task**,
2. the **project**,
3. the **client**,
4. the **workspace default**.

The interface tells you where a rate comes from, for example "inherited from client: €60/h".

## Billing modes

Each project bills in one of three ways:

- **Hourly.** Billable hours times the resolved rate.
- **Fixed price.** The agreed amount, whatever the hours. Fairhour still tracks the time and
  shows the [effective hourly rate](#effective-hourly-rate).
- **Day rate.** A full day or a half day. You configure how many hours make a full day and the
  threshold from which time counts as a half day.

## Extra lines

An invoice can carry more than time:

- **Expenses**.
- **Mileage**: kilometers times a rate per kilometer, with an explicit rounding.
- **Equipment**.

## Currencies

A client has a currency. Mixing currencies on one invoice requires an **explicit exchange rate**,
which is recorded on the invoice draft. Without it Fairhour refuses to guess and reports an
error.

## Budgets

A project can have a budget in **hours** or in **money**, and a task can carry an estimate.

- Fairhour alerts you when a budget reaches **80%** and **100%**. The thresholds are
  configurable.
- Project pages show the burn as a progress bar with a text alternative, and a notice appears
  when a new entry crosses a threshold.
- For tasks with an estimate, you can compare estimate and actual.

## Effective hourly rate

Revenue divided by tracked hours, per project and per client: "this fixed-price project paid you
€X per hour". When no time was tracked there is no value, rather than an infinite one.

## Next

[Invoices and taxes](/fairhour/guides/invoices-and-taxes/) turns these amounts into an invoice.
