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
trattenuta da ciò che il cliente ti paga. Fairhour è pensato per fare questi calcoli per te,
mostrare ogni passaggio e citare la regola che lo prevede (il motore arriva con la v0.2). Il
[pacchetto fiscale per l'Italia](/fairhour/it/tax-packs/it/#9-worked-examples) (in inglese)
contiene gli esempi svolti.

## Come funziona

Fairhour viene costruito una versione alla volta, quindi i passaggi qui sotto sono il flusso
previsto, non qualcosa che puoi usare oggi. Ognuno indica la versione che lo porta (vedi la
[roadmap](#roadmap)).

1. **Organizza** (v0.4, sul database della v0.3). Un'area di lavoro conterrà clienti, che
   conterranno progetti, che conterranno attività. Ogni livello potrà avere una tariffa e vincerà
   quella più specifica ([tariffe e budget](/fairhour/it/guides/rates-and-budgets/), in inglese).
2. **Registra** (v0.4; il calcolo del tempo arriva con la v0.2). Avvierai un timer, aggiungerai le
   registrazioni a mano oppure scriverai `2h design Acme ieri`
   ([registrazione del tempo](/fairhour/it/guides/time-tracking/), in inglese).
3. **Fattura** (il motore fiscale arriva con la v0.2, la schermata di calcolo con la v0.4).
   Sceglierai un cliente e un periodo. Fairhour costruirà le righe della fattura dal tempo
   fatturabile, le passerà al pacchetto fiscale dell'area di lavoro e mostrerà ogni importo con la
   sua spiegazione ([fatture e imposte](/fairhour/it/guides/invoices-and-taxes/), in inglese).
4. **Analizza** (v0.5). Dashboard, fogli ore in PDF ed esportazioni CSV mostreranno dove sono
   andati il tempo e il denaro.

## Principi

Sono gli impegni attorno ai quali è costruito il progetto. La versione tra parentesi indica quando
ciascuno diventa vero nel software; le licenze valgono già oggi.

- **Denaro esatto** (v0.2). Gli importi saranno interi nelle unità minori (`bigint`), mai numeri
  in virgola mobile, e ogni arrotondamento dichiarerà la sua modalità
  ([ADR-0003](/fairhour/it/adr/0003-money-representation/), già accettato, in inglese).
- **Ogni numero è spiegato** (il motore con la v0.2, la schermata della fattura con la v0.4). Un
  pacchetto fiscale citerà la legge per ogni regola e la schermata della fattura mostrerà la
  traccia passo dopo passo ([ADR-0004](/fairhour/it/adr/0004-tax-engine-architecture/), in
  inglese).
- **Self-hosting al primo posto** (v0.8). Serviranno un container più PostgreSQL, senza
  dipendenza da un fornitore di hosting e senza che alcun dato lasci la tua istanza se non lo
  configuri tu ([self-hosting](/fairhour/it/self-hosting/), in inglese).
- **Accessibile e internazionale** (dalla v0.4). L'interfaccia punterà alla conformità WCAG 2.2 AA
  e sarà disponibile in inglese e in italiano, con altre traduzioni benvenute.
- **Aperto** (già oggi). Il prodotto è AGPL-3.0, il motore fiscale è MIT così che chiunque possa
  incorporarlo, e questa documentazione è CC BY 4.0 ([licenza](/fairhour/it/license/)).

## Roadmap

Le versioni seguono le milestone del backlog del progetto. Ogni milestone corrisponde a una fase
del lavoro; l'[elenco delle milestone su GitHub](https://github.com/fabiovincenzi/fairhour/milestones)
ne segue i dettagli.

| Versione | Nome                  | Cosa porta                                                                                | Stato       |
| -------- | --------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| v0.1     | Foundation            | Strumenti del monorepo, CI, governance, backlog come codice, questo sito                  | Completata  |
| v0.2     | Core & Tax Engine     | Denaro esatto, calcolo del tempo, tariffe, motore `TaxPack`, pacchetti Italia e generico  | Prossima    |
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
