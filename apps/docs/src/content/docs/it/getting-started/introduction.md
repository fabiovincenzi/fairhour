---
title: Introduzione
description: Cos'è Fairhour, come funziona e cosa esiste oggi.
sidebar:
  order: 1
---

Fairhour è un time tracker open source e self-hostable che trasforma il tempo registrato negli
**importi esatti da mettere in fattura**. Un motore fiscale a pacchetti, specifico per ogni paese,
fa i calcoli, spiega ogni passaggio citando la norma e permette alla community di aggiungere altri
paesi. L'Italia è il pacchetto di riferimento.

:::caution[Sviluppo iniziale]
Fairhour è all'inizio della sua roadmap: oggi il repository contiene gli strumenti di sviluppo, il
sito della documentazione e il progetto del motore fiscale. Le pagine di questo sito che
descrivono una funzione non ancora disponibile lo dicono e indicano la versione che la porterà. Gli
importi fiscali sono **indicativi**: verificali sempre con il tuo commercialista prima di emettere
una fattura.
:::

## Perché Fairhour

I time tracker ti dicono quante ore hai lavorato. Fairhour ti dice anche cosa fatturare.

Per un libero professionista italiano in _regime forfettario_, 20 ore a 50,00 € non fanno
semplicemente 1.000,00 €: sono 1.000,00 € più 40,00 € di _rivalsa INPS_ al 4% più 2,00 € di
imposta di bollo, con la dicitura di esenzione richiesta dalla legge, per un totale di 1.042,00 €.
Nel _regime ordinario_ lo stesso lavoro diventa IVA in più e una _ritenuta d'acconto_ del 20%
trattenuta da ciò che il cliente ti paga. Fairhour fa questi calcoli per te, mostra ogni passaggio
e cita la regola che lo prevede. Il [pacchetto fiscale per l'Italia](/fairhour/it/tax-packs/it/#9-worked-examples)
(in inglese) contiene gli esempi svolti.

## Come funziona

1. **Organizza.** Un'area di lavoro contiene clienti, che contengono progetti, che contengono
   attività. Ogni livello può avere una tariffa e vince quella più specifica
   ([tariffe e budget](/fairhour/it/guides/rates-and-budgets/), in inglese).
2. **Registra.** Avvia un timer, aggiungi le registrazioni a mano oppure scrivi
   `2h design Acme ieri` ([registrazione del tempo](/fairhour/it/guides/time-tracking/), in
   inglese).
3. **Fattura.** Scegli un cliente e un periodo. Fairhour costruisce le righe della fattura dal
   tempo fatturabile, le passa al pacchetto fiscale dell'area di lavoro e mostra ogni importo con
   la sua spiegazione ([fatture e imposte](/fairhour/it/guides/invoices-and-taxes/), in inglese).
4. **Analizza.** Dashboard, fogli ore in PDF ed esportazioni CSV mostrano dove sono andati il
   tempo e il denaro.

## Principi

- **Denaro esatto.** Gli importi sono interi nelle unità minori (`bigint`), mai numeri in virgola
  mobile, e ogni arrotondamento dichiara la sua modalità
  ([ADR-0003](/fairhour/it/adr/0003-money-representation/), in inglese).
- **Ogni numero è spiegato.** Un pacchetto fiscale cita la legge per ogni regola e la schermata
  della fattura mostra la traccia passo dopo passo
  ([ADR-0004](/fairhour/it/adr/0004-tax-engine-architecture/), in inglese).
- **Self-hosting al primo posto.** Un container più PostgreSQL, nessuna dipendenza da un fornitore
  di hosting e nessun dato lascia la tua istanza se non lo configuri tu
  ([self-hosting](/fairhour/it/self-hosting/), in inglese).
- **Accessibile e internazionale.** L'interfaccia punta alla conformità WCAG 2.2 AA ed è
  disponibile in inglese e in italiano, con altre traduzioni benvenute.
- **Aperto.** Il prodotto è AGPL-3.0, il motore fiscale è MIT così che chiunque possa
  incorporarlo, e questa documentazione è CC BY 4.0 ([licenza](/fairhour/it/license/)).

## Roadmap

Le versioni seguono le milestone del backlog del progetto. Ogni milestone corrisponde a una fase
del lavoro; l'[elenco delle milestone su GitHub](https://github.com/fabiovincenzi/fairhour/milestones)
ne segue i dettagli.

| Versione | Nome                  | Cosa porta                                                                                | Stato       |
| -------- | --------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| v0.1     | Foundation            | Strumenti del monorepo, CI, governance, backlog come codice, questo sito                  | In corso    |
| v0.2     | Core & Tax Engine     | Denaro esatto, calcolo del tempo, tariffe, motore `TaxPack`, pacchetti Italia e generico  | Pianificata |
| v0.3     | Data & Auth           | Schema PostgreSQL, migrazioni, accesso, aree di lavoro e ruoli, isolamento dei tenant     | Pianificata |
| v0.4     | Web MVP               | Clienti, progetti, timer, registrazioni, tariffe, schermata di calcolo, en e it           | Pianificata |
| v0.5     | Reports               | Dashboard, grafici, fogli ore PDF, esportazione CSV, link di condivisione firmati         | Pianificata |
| v0.6     | Hardening             | Test end-to-end e di accessibilità, header di sicurezza, limiti di richieste, prestazioni | Pianificata |
| v0.7     | Public API & Webhooks | API REST con OpenAPI, token di accesso personali, webhook in uscita                       | Pianificata |
| v0.8     | Self-hosting          | File compose di produzione, immagini container, pipeline di rilascio, guida               | Pianificata |
| v0.9     | Desktop Companion     | Timer nella barra di sistema, rilevamento dell'inattività, suggerimenti privati           | Pianificata |
| v0.10    | FatturaPA             | Esportazione XML FatturaPA validata con lo schema ufficiale                               | Pianificata |
| v1.0     | Launch                | Rifinitura per il lancio, dati dimostrativi, revisione della documentazione               | Pianificata |

## Da dove continuare

- Esegui il codice e il sito della documentazione in locale:
  [guida rapida](/fairhour/it/getting-started/quickstart/) (in inglese).
- Scopri come è costruito il motore fiscale: [pacchetti fiscali](/fairhour/it/tax-packs/) e
  [progetto del motore](/fairhour/it/design/tax-engine/) (in inglese).
- Dai una mano: [guide per contribuire](/fairhour/it/contributing/) (in inglese). Per tradurre
  Fairhour nella tua lingua serve la
  [guida alla traduzione](/fairhour/it/contributing/translations/).
