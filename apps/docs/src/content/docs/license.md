---
title: License
description: Which license applies to the Fairhour apps, the libraries and the documentation.
sidebar:
  order: 100
---

Fairhour uses three licenses. They are chosen per package and per kind of content, and the
reasoning is recorded in [ADR-0002](/fairhour/adr/0002-licensing/).

| What                                                                                        | License                                |
| ------------------------------------------------------------------------------------------- | -------------------------------------- |
| The apps: `apps/web`, `apps/desktop`, `apps/docs` (site code and configuration)             | **AGPL-3.0-only**                      |
| The packages that serve the apps: `api`, `db`, `ui`, `pdf`, `core`, `config`                | **AGPL-3.0-only**                      |
| Repository scripts (`scripts/*`) and everything else at the root (workflows, configuration) | **AGPL-3.0-only**                      |
| The tax engine: `@fairhour/money`, `@fairhour/tax-core`, every `@fairhour/tax-pack-*`       | **MIT**                                |
| Documentation: `docs/**` and the content of this site (`apps/docs/src/content/**`)          | **CC BY 4.0**; code samples in it: MIT |

Every package states its license in the `license` field of its `package.json`, and a package or
directory with a different license ships its own `LICENSE` file.

## In practice

| I want to...                                                  | Can I?                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Embed `@fairhour/tax-pack-it` in a proprietary invoicing app  | Yes. Keep the MIT notice.                                               |
| Self-host an unmodified Fairhour for my company or my clients | Yes. Keep the notices.                                                  |
| Run a modified Fairhour as a service for others               | Yes, if its users can get the source of your version (AGPL section 13). |
| Distribute a modified desktop app                             | Yes, with its source under AGPL-3.0.                                    |
| Quote or translate a tax pack guide, or any page of this site | Yes, with attribution (CC BY 4.0).                                      |
| Paste a code sample from the docs into my project             | Yes (MIT).                                                              |

This table explains the intent; the license texts are authoritative.

## Why this split

The AGPL keeps the product open, including modified versions offered over a network. The tax
engine is MIT so that anyone can embed it, which is what makes a country pack written once useful
everywhere. The documentation is CC BY 4.0 because the AGPL is written for programs, and because
tax explanations should be as easy to reuse as the code they describe, with credit that leads
readers back to the maintained version.

## Attribution

When you reuse this documentation, credit it like this:

> Fairhour documentation, <https://github.com/fabiovincenzi/fairhour>, CC BY 4.0

## The texts

- [GNU AGPL-3.0](https://github.com/fabiovincenzi/fairhour/blob/main/LICENSE) (the repository's
  root `LICENSE`)
- [CC BY 4.0 for the documentation](https://github.com/fabiovincenzi/fairhour/blob/main/docs/LICENSE)
- [MIT](https://opensource.org/license/mit), whose notice is in each MIT package

None of these licenses grants rights to the Fairhour name or logo. Third-party texts keep their
own license: for example, the code of conduct is adapted from the Contributor Covenant (CC BY 4.0).
Contributions are certified with the Developer Certificate of Origin, and there is no CLA: a
contribution is licensed under the license of the files it changes.
