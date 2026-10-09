# Translating Fairhour

English is the source locale of Fairhour and Italian is the first translation. Any other language
is welcome, and you do not need to be a developer to add it: a translation is a JSON file and a
pull request (the GitHub web editor is enough).

## Before you start

1. Open a [translation request](https://github.com/fabiovincenzi/fairhour/issues/new?template=translation_request.yml)
   with the locale code, so that nobody translates the same language twice and we can answer
   terminology questions early.
2. Use a [BCP 47](https://www.rfc-editor.org/info/bcp47) code: `de`, `fr`, `pt-BR`.
3. Remember that the message files appear together with the web app (WEB-002, release v0.4) and
   the desktop app (release v0.9). Until then you can prepare the [glossary](#glossary) of your
   language.

## Where the strings live

| Surface       | English (source)                | Your translation                                         |
| ------------- | ------------------------------- | -------------------------------------------------------- |
| Web app       | `apps/web/messages/en.json`     | `apps/web/messages/<locale>.json`                        |
| Desktop app   | `apps/desktop/messages/en.json` | `apps/desktop/messages/<locale>.json`                    |
| Documentation | `apps/docs/src/content/docs/**` | `apps/docs/src/content/docs/<locale>/**`, the same paths |

Documentation pages that are not translated fall back to the English page, with a notice. The
site is translated page by page, starting with the home page and the introduction. A new
documentation locale also needs an entry in `locales` in `apps/docs/astro.config.mjs`.

## Translating the app, step by step

1. Copy `en.json` to `<locale>.json` in the same folder.
2. Translate the **values**. Never change a **key**: keys are how the code finds the text.
3. Keep every ICU placeholder, plural and tag ([see below](#icu-messages)).
4. Run `pnpm i18n:check` from the repository root.
5. Register the locale in the app's list of supported locales, which is created with the app
   shell (WEB-002); ask in the translation request if you cannot find it.
6. Open a pull request. Use a Conventional Commit message such as
   `feat(i18n): add German (de) translation`, and sign off your commits with `git commit -s`.

A made-up excerpt, to show what changes and what does not:

```json
{
  "entries": {
    "title": "Time entries",
    "count": "{count, plural, one {# entry} other {# entries}}",
    "welcome": "Welcome back, {name}. <link>Start the timer</link>"
  }
}
```

```json
{
  "entries": {
    "title": "Registrazioni",
    "count": "{count, plural, one {# registrazione} other {# registrazioni}}",
    "welcome": "Bentornato, {name}. <link>Avvia il timer</link>"
  }
}
```

## What `pnpm i18n:check` verifies

For every locale of every app, the check compares your file with `en.json`:

- **Missing keys** fail the check: every English key needs a translation.
- **Placeholder mismatches** fail the check: the set of ICU arguments (`{name}`, `{count}`) and
  tags (`<link>`) of a message must be the same as in English.
- **Stale keys** (in your file, not in English) and values **identical to English** (possibly
  untranslated) are reported but do not fail it.

CI runs the same check on every pull request and shows the coverage of each locale in the job
summary.

## ICU messages

Messages use the [ICU message syntax](https://unicode-org.github.io/icu/userguide/format_parse/messages/),
through [next-intl](https://next-intl.dev/docs/usage/messages).

- **Arguments**, such as `{name}` or `{count}`, are replaced by the app. Copy the name exactly;
  you may move it wherever your grammar needs it. Never type a number, a date or an amount that
  the app should format for the user's locale.
- **Plurals**, such as `{count, plural, one {# entry} other {# entries}}`: translate only the text
  inside the inner braces. Keep `plural`, the category names and `#` (the number). Provide the
  categories your language needs (many need only `one` and `other`; Polish and Russian, for
  example, also need `few` and `many`; see the
  [CLDR plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html))
  and always keep `other`.
- **Selects**, such as `{role, select, owner {...} other {...}}`: translate the text inside the
  braces, never the argument name or the option names.
- **Tags**, such as `<link>...</link>` or `<b>...</b>`: translate the text between them and keep the
  tags.
- **Apostrophes**: both the typographic `’` and the straight `'` are fine, and `i18n:check`
  understands both: `L’area di lavoro {name}` and `L'area di lavoro {name}` have the argument
  `name`. In ICU a straight apostrophe is an ordinary character, with two exceptions. A double
  `''` is one apostrophe, and a single `'` directly before `{`, `}` or (inside a plural) `#`
  starts quoted text that runs up to the next single `'`. So when an elision comes right before
  an argument, write `dell’{name}` (typographic) or `dell''{name}` (two straight apostrophes);
  `dell'{name}` would show `{name}` literally. The typographic apostrophe is the better choice
  for readers, as it is the correct character in running text.

## Style

- Pick one way of addressing the user and keep it. The Italian translation uses the informal
  _tu_.
- Keep texts short: buttons and labels have little room. Follow the capitalization of English
  (sentence case) and do not add a full stop where English has none.
- Do not translate the name **Fairhour**, keyboard keys, code, identifiers or environment variable
  names.
- A machine translation is a fine first draft if a fluent speaker reviews it before the pull
  request, as for any AI-assisted contribution.

## Glossary

Use the same word for the same concept everywhere. The Italian column is the reference; copy
this table into your translation request when you start another language and fill in your own
column.

| English           | Italiano                    | Notes                                                                               |
| ----------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| Fairhour          | Fairhour                    | Never translated                                                                    |
| workspace         | area di lavoro              |                                                                                     |
| client            | cliente                     |                                                                                     |
| project           | progetto                    |                                                                                     |
| task              | attività                    |                                                                                     |
| time entry        | registrazione               | For creating an account use _crea un account_, to avoid confusion with "registrati" |
| timer             | timer                       |                                                                                     |
| quick add         | inserimento rapido          |                                                                                     |
| billable          | fatturabile                 |                                                                                     |
| rate              | tariffa                     | _Hourly rate_ is _tariffa oraria_                                                   |
| budget            | budget                      |                                                                                     |
| invoice           | fattura                     |                                                                                     |
| timesheet         | foglio ore                  |                                                                                     |
| report            | report                      |                                                                                     |
| share link        | link di condivisione        |                                                                                     |
| tax pack          | pacchetto fiscale           | A country's set of tax rules                                                        |
| explanation trace | traccia della spiegazione   | The step-by-step explanation of an amount                                           |
| taxable base      | imponibile                  |                                                                                     |
| VAT               | IVA                         |                                                                                     |
| total             | totale                      |                                                                                     |
| net payable       | netto a pagare              |                                                                                     |
| idle detection    | rilevamento dell’inattività | Desktop app                                                                         |

**Terms of a country's tax law stay in that country's language**, in every locale. In Italian
(and in any other language) the interface keeps _regime forfettario_, _regime ordinario_,
_ritenuta d'acconto_, _rivalsa INPS_ and _imposta di bollo_ as they are, with a short explanation
next to them where a reader may need one. These are the words an Italian invoice uses; a
translation would not match the law or the invoice.

## Questions

Ask in the translation request, or in
[GitHub Discussions](https://github.com/fabiovincenzi/fairhour/discussions). Thank you for making
Fairhour speak your language.
