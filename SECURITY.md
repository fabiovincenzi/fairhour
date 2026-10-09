# Security policy

Fairhour handles time records, client data and invoice-relevant figures, so we take security
seriously. Thank you for helping keep users safe.

## Supported versions

Fairhour is pre-1.0. Only the latest minor release receives security fixes.

| Version              | Supported                  |
| -------------------- | -------------------------- |
| latest `0.x` release | ✅                         |
| older `0.x` releases | ❌ (please upgrade)        |
| `main` branch        | ✅ (fixes land here first) |

After 1.0, the latest minor of the current major and the previous major (for 6 months) will be supported.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for security problems.**

Report privately through GitHub:
[**Report a vulnerability**](https://github.com/fabiovincenzi/fairhour/security/advisories/new)
(Security tab → _Report a vulnerability_). Include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected versions/commits and your environment (self-hosted? which configuration?),
- whether you would like to be credited.

## What to expect

- Acknowledgement within **3 business days**.
- An initial assessment (severity, affected versions) within **7 days**.
- A fix or mitigation plan within **30 days** for high/critical issues; we will keep you informed.
- Coordinated disclosure: we publish a GitHub Security Advisory (with a CVE when appropriate)
  once a fixed release is available, crediting you unless you prefer otherwise.

## Scope

In scope: the code in this repository (web app, API, desktop app, packages, Docker images,
workflows). Out of scope: vulnerabilities in third-party dependencies that are already public
(report them upstream; we track them through Renovate and dependency review), social
engineering, and denial-of-service through volumetric attacks on self-hosted instances.

## Hardening guidance for self-hosters

See the [self-hosting guide](https://fabiovincenzi.github.io/fairhour/self-hosting/): keep the
image up to date, set a strong `BETTER_AUTH_SECRET`, run behind TLS, and restrict database access.
