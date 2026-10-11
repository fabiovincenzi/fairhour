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

A rate is either **per hour** or **per day**. You can set one at four levels, and Fairhour uses
the most specific one:

1. the **task**,
2. the **project**,
3. the **client**,
4. the **workspace default**.

The interface tells you where a rate comes from, for example "inherited from client: €60/h".

### Hourly and day rates are separate

Fairhour resolves the hourly rate and the day rate separately, each through the four levels
above. A level that only has the other kind of rate is skipped:

- An **hourly** project looks for an hourly rate. A day rate is never used for it.
- A **day-rate** project needs a day rate. Fairhour does not fall back to an hourly rate and does
  not multiply it by the hours of a day, because €80 an hour and €560 a day are two different
  numbers that you set on purpose.
- There is no conversion between the two. When no level has a rate of the kind the project needs,
  Fairhour reports a missing rate instead of guessing.

## Billing modes

Each project bills in one of three ways:

- **Hourly.** Billable hours times the resolved hourly rate.
- **Fixed price.** The agreed amount, whatever the hours. Fairhour still tracks the time and
  shows the [effective hourly rate](#effective-hourly-rate).
- **Day rate.** A full day or a half day, times the resolved day rate. You configure how many
  hours make a full day and the threshold from which time counts as a half day.

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
