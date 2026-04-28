# qonto-backup — Sauvegarde Qonto auto-hébergée (transactions, justificatifs, PAdES probants)

> **En 1 phrase** — CLI open-source qui exporte chaque nuit l'intégralité de ton compte Qonto sur ton disque : transactions en JSON, justificatifs en PDF/image, version probante PAdES légalement opposable. Tourne en Docker sur Synology, Raspberry Pi ou n'importe quelle machine Linux. Incrémentale, idempotente, sans dépendance runtime.

[![Image Docker](https://img.shields.io/badge/ghcr.io-tonoid%2Fqonto--backup-blue?logo=docker)](https://github.com/tonoid/qonto-backup/pkgs/container/qonto-backup)
[![Licence MIT](https://img.shields.io/badge/Licence-MIT-green.svg)](./LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-brightgreen)](https://nodejs.org/)
[![Build](https://github.com/tonoid/qonto-backup/actions/workflows/docker.yml/badge.svg)](https://github.com/tonoid/qonto-backup/actions/workflows/docker.yml)

**Pour qui** — entrepreneurs, freelances, dirigeants de TPE/PME et experts-comptables qui veulent garder une copie locale de leurs données Qonto, conforme à l'obligation française de conservation de 10 ans (Code de commerce, art. L123-22).

**Mots-clés** — sauvegarde Qonto, export Qonto API, backup justificatifs Qonto, archivage Qonto Synology, auto-hébergement compta, conservation pièces comptables 10 ans, FEC Qonto, contrôle fiscal Qonto, expert-comptable Qonto, PAdES probant, RGPD souveraineté données.

> ⚠️ **Disclaimer** — Le code de ce projet a été généré avec [Claude Code](https://claude.com/claude-code) (Anthropic), puis **testé et revu manuellement** par un humain. Il est fourni en l'état, sans garantie. Avant tout usage en production sur tes données comptables : lis le code (~1000 lignes), teste avec `--dry-run` puis `--since=YYYY-MM-DD` sur une fenêtre courte, et vérifie les fichiers produits. PRs et issues bienvenues.

---

## Pourquoi ce projet ?

Qonto stocke tes transactions et tes justificatifs sur ses serveurs en Allemagne et en Irlande. Tant que ton abonnement est actif, tout va bien. Mais en France, plusieurs scénarios cassent ce confort :

- **Conservation légale 10 ans** — l'article L123-22 du Code de commerce impose de conserver les pièces comptables pendant 10 ans. Si tu fermes ton compte Qonto avant cette échéance, l'accès aux archives devient compliqué.
- **Contrôle fiscal ou URSSAF** — l'administration peut exiger les justificatifs sous 30 jours. Si Qonto a une panne ou si l'agent veut un format probant signé numériquement (PAdES), l'export manuel ne suffit pas.
- **FEC (Fichier des Écritures Comptables)** — exigible à tout moment par la DGFIP. Avoir tes données en JSON Lines locales facilite la génération du FEC par ton expert-comptable.
- **Changement de banque pro** — l'export manuel via l'application Qonto est limité (CSV uniquement, pas les pièces jointes en lot, pas la version probante).
- **Souveraineté & RGPD** — tu reprends le contrôle de tes données comptables, sans dépendance à un prestataire tiers.

`qonto-backup` règle tout ça en **30 minutes de setup** : un cron quotidien sur ton NAS qui matérialise localement l'intégralité de ton compte Qonto, organisé par année / mois / jour, avec versions probantes PAdES.

> Tu gardes la **souveraineté de tes données comptables**, indépendamment de Qonto.

## Fonctionnalités

- ✅ **Sauvegarde incrémentale** — un seul appel `updated_at_from` cursor par compte. Re-runs en quelques secondes.
- ✅ **Multi-comptes** — gère tous les `bank_accounts` de ton organisation (compte courant, sous-comptes, comptes secondaires).
- ✅ **Justificatifs** — chaque PJ téléchargée depuis le S3 présigné Qonto, en format original (PDF, JPG, PNG, HEIC, WebP, TIFF…).
- ✅ **Version probante PAdES** — la variante signée légalement opposable est récupérée à côté de la PJ standard.
- ✅ **Snapshots référentiels** — `organization.json`, `labels.json`, `beneficiaries.json` rafraîchis à chaque run.
- ✅ **Idempotent** — un fichier déjà téléchargé est skipped. Crash en cours = reprise propre au run suivant.
- ✅ **Zero runtime dependency** — `fetch` natif Node 22, `node:fs/promises`, rien d'autre. Pas de surface d'attaque supply-chain.
- ✅ **Atomic writes** — tout passe par `*.tmp` + `rename`. Jamais de fichier corrompu, même en cas de coupure de courant.
- ✅ **Docker multi-arch** — image `linux/amd64` + `linux/arm64` publiée sur GHCR à chaque release.
- ✅ **MIT licensed** — fork-friendly, commercial-friendly.

## Architecture de sortie

```
backup/
├── .state.json                                   # cursor sync incrémental par compte
├── organization.json                             # snapshot org + bank accounts + IBANs
├── labels.json                                   # référentiel labels
├── beneficiaries.json                            # { beneficiaries: [...], international: [...] }
└── 2026/
    └── 04/
        ├── transactions.jsonl                    # 1 ligne JSON par transaction du mois
        ├── 15-credit-mutuel-att_xyz.pdf
        └── 15-credit-mutuel-att_xyz-probative.pdf
```

| Composant | Format | Origine |
|---|---|---|
| `transactions.jsonl` | JSON Lines, 1 ligne / transaction | Endpoint `/v2/transactions` avec `includes[]=attachments` |
| `{DD}-{slug}-{att_id}.{ext}` | Fichier original Qonto | URL S3 présignée 30 min |
| `{DD}-{slug}-{att_id}-probative.{ext}` | PAdES probative variant | `probative_attachment.url` |
| `organization.json` | JSON | `/v2/organization` |
| `labels.json` | JSON paginé | `/v2/labels` |
| `beneficiaries.json` | JSON paginé | `/v2/beneficiaries` |

Conventions de nommage :

- `{DD}` = jour de `emitted_at` (jour réel d'émission, stable même si Qonto met à jour la transaction).
- `{slug}` = `clean_counterparty_name` → `label` → `reference` → `transaction_id`, normalisé (NFD strip diacritics, lowercase, kebab, max 50 char).
- `{ext}` = dérivée du `file_content_type` Qonto (`pdf`, `jpg`, `png`, `heic`, `webp`, `tiff`, fallback `bin`).

## Quick start

### 1. Récupérer les credentials Qonto

*Qonto → Paramètres → Integrations and Partnerships → API → Generate API key*. Le header d'authentification est `Authorization: {login}:{secret-key}` (texte brut, **pas** Base64).

### 2. Lancer le container

```bash
docker run --rm \
  -e QONTO_LOGIN=mon-orga-1234 \
  -e QONTO_SECRET_KEY=xxxxxxxxxxxx \
  -v $(pwd)/backup:/backup \
  ghcr.io/tonoid/qonto-backup:latest --dry-run
```

Retire `--dry-run` pour le run réel. La première synchro peut prendre plusieurs heures selon l'historique. Les suivantes : quelques secondes.

### 3. Planifier en cron

Voir [Déploiement Synology](#déploiement-synology--docker-recommandé-dsm-72) ou [Cron Linux générique](#cron-linux-générique).

## Stack technique

- **Node.js 22+** — fetch natif, `--env-file`, `node:test` runner, parser TS strip-types
- **TypeScript 5.7+** strict — `rewriteRelativeImportExtensions`, `verbatimModuleSyntax`
- **Zero runtime dependency** — uniquement devDeps `typescript` + `@types/node`
- **Docker multi-stage** — image finale `node:22-alpine` non-root, ~150 MB

## CLI

```
qonto-backup [options]

Options:
  --full                Ignore .state.json et resync depuis 0
  --since=YYYY-MM-DD    Override manuel du cursor updated_at_from
  --dry-run             Log les actions sans rien écrire
  --debug               Logs verbeux
  -h, --help            Aide
```

Exit codes :

| Code | Signification |
|---|---|
| `0` | Succès |
| `1` | Erreur runtime |
| `2` | Argv invalide |
| `3` | Auth Qonto refusée (clé révoquée / invalide) |

## Variables d'environnement

| Variable | Requise | Défaut | Description |
|---|---|---|---|
| `QONTO_LOGIN` | ✅ | — | Slug de l'organisation Qonto (`mon-orga-1234`) |
| `QONTO_SECRET_KEY` | ✅ | — | Secret key générée dans Qonto |
| `BACKUP_DIR` | ❌ | `./backup` | Dossier de sortie (en Docker : `/backup`) |
| `QONTO_BASE_URL` | ❌ | `https://thirdparty.qonto.com/v2/` | Override pour tests |
| `LOG_FORMAT` | ❌ | auto | `json` ou `pretty` (auto-détecte TTY) |

## Image Docker prebuilt (GHCR)

Multi-arch (`linux/amd64` + `linux/arm64`), publiée à chaque push sur `main` et chaque tag `v*` :

```
ghcr.io/tonoid/qonto-backup:latest         # tip de main
ghcr.io/tonoid/qonto-backup:vX.Y.Z         # release semver
ghcr.io/tonoid/qonto-backup:X.Y            # minor pinning
ghcr.io/tonoid/qonto-backup:X              # major pinning
ghcr.io/tonoid/qonto-backup:sha-abcdef0    # commit pinning
```

Le workflow [`.github/workflows/docker.yml`](./.github/workflows/docker.yml) gère la publication. Aucune authentification requise pour `pull` (image publique).

## Release automatisée (release-please)

Le versioning suit [Conventional Commits](https://www.conventionalcommits.org/) et est entièrement piloté par les messages de commit :

| Type de commit | Bump | Exemple |
|---|---|---|
| `feat: …` | minor (`1.0.0 → 1.1.0`) | `feat: add Slack notification on failure` |
| `fix: …` | patch (`1.0.0 → 1.0.1`) | `fix: handle 410 on probative attachment` |
| `feat!: …` ou `BREAKING CHANGE:` | major (`1.0.0 → 2.0.0`) | `feat!: drop Node 22 support` |
| `docs:` `chore:` `refactor:` | aucun bump (intégré au CHANGELOG) | `docs: clarify Synology cron setup` |

### Flow

1. Tu pushes des commits sur `main` (en respectant le format conventional).
2. Le workflow [`release-please.yml`](./.github/workflows/release-please.yml) ouvre (ou met à jour) automatiquement une **Release PR** qui :
   - Bump `package.json` à la prochaine version semver appropriée
   - Met à jour le `CHANGELOG.md` avec les nouveautés depuis la dernière release
   - Met à jour `.release-please-manifest.json`
3. Tu reviewes et **merge la Release PR**.
4. release-please crée automatiquement le tag `vX.Y.Z` + une [GitHub Release](https://github.com/tonoid/qonto-backup/releases) avec les release notes.
5. Le workflow `docker.yml` se déclenche sur le tag et publie sur GHCR :
   - `ghcr.io/tonoid/qonto-backup:vX.Y.Z`
   - `ghcr.io/tonoid/qonto-backup:X.Y`
   - `ghcr.io/tonoid/qonto-backup:X`
   - `ghcr.io/tonoid/qonto-backup:latest`

Une seule action manuelle dans tout le flow : merger la Release PR. Volontaire — c'est ton point de revue avant chaque release publique.

### Configuration

- [`release-please-config.json`](./release-please-config.json) — `release-type: node`, sections du CHANGELOG, comportement pré-1.0
- [`.release-please-manifest.json`](./.release-please-manifest.json) — version actuelle suivie par release-please

## Déploiement Synology — Docker (recommandé DSM 7.2+)

L'approche la plus simple : pull l'image préconstruite, lance-la en cron via le Planificateur de tâches.

### 1. Préparer le dossier sur le NAS

```bash
ssh admin@<nas-ip>
sudo mkdir -p /volume1/docker/qonto-backup/backup
sudo chown -R 1000:1000 /volume1/docker/qonto-backup/backup  # UID de l'user "app" du container
cd /volume1/docker/qonto-backup
```

### 2. Créer `.env` et `docker-compose.yml`

`.env` :

```env
QONTO_LOGIN=mon-orga-1234
QONTO_SECRET_KEY=xxxxxxxxxxxxxxxxxxxx
```

`docker-compose.yml` minimal (pas besoin de `build:` côté NAS) :

```yaml
services:
  qonto-backup:
    image: ghcr.io/tonoid/qonto-backup:latest
    container_name: qonto-backup
    restart: "no"
    env_file:
      - .env
    environment:
      BACKUP_DIR: /backup
    volumes:
      - ./backup:/backup
```

```bash
chmod 600 .env
```

### 3. Pull et test

```bash
sudo docker compose pull
sudo docker compose run --rm qonto-backup --dry-run
sudo docker compose run --rm qonto-backup --since=2026-04-01   # premier run restreint
ls backup/2026/04/
```

### 4. Cron via Planificateur DSM

*Panneau de configuration → Planificateur de tâches → Créer → Tâche planifiée → Script défini par l'utilisateur*

- **Tâche** : `qonto-backup`
- **Utilisateur** : `root` (requis pour `docker`)
- **Planifier** : *Quotidien*, 03:00
- **Paramètres → Script** :

```bash
cd /volume1/docker/qonto-backup \
  && /usr/local/bin/docker compose pull --quiet \
  && /usr/local/bin/docker compose run --rm qonto-backup \
  >> /var/log/qonto-backup.log 2>&1
```

Le `pull --quiet` met automatiquement à jour vers la dernière `:latest` avant chaque run. Pour figer une version, remplace `:latest` par `:v0.1.0` dans `docker-compose.yml`.

Coche *Notifier par email en cas d'erreur* — DSM enverra un mail si l'exit code ≠ 0.

### 5. Vérifier

```bash
tail -f /var/log/qonto-backup.log
# ou : Container Manager → conteneur qonto-backup → Journal
```

## Déploiement Synology — Binaire Node

Pré-requis : paquet *Node.js v22* installé via Package Center (ou via Entware).

```bash
cd /volume1/qonto-backup
git clone https://github.com/tonoid/qonto-backup.git .
npm ci
npm run build
cp .env.example .env  # remplir QONTO_LOGIN / QONTO_SECRET_KEY
node --env-file=.env dist/index.js --dry-run
```

Task Scheduler DSM → *Script défini par l'utilisateur* :

```bash
cd /volume1/qonto-backup && LOG_FORMAT=json /usr/local/bin/node --env-file=.env dist/index.js >> /var/log/qonto-backup.log 2>&1
```

## Cron Linux générique

```cron
# /etc/cron.d/qonto-backup
0 3 * * * root cd /opt/qonto-backup && /usr/bin/docker compose pull --quiet && /usr/bin/docker compose run --rm qonto-backup >> /var/log/qonto-backup.log 2>&1
```

Pour Raspberry Pi (arm64) : même image, le multi-arch GHCR sélectionne automatiquement la bonne plateforme.

## Build local (dev)

```bash
git clone https://github.com/tonoid/qonto-backup.git
cd qonto-backup
npm ci
npm test
npm run build
node --env-file=.env dist/index.js --dry-run
```

`docker-compose.yml` supporte les deux modes :

```bash
docker compose pull   && docker compose run --rm qonto-backup --dry-run   # prod
docker compose build  && docker compose run --rm qonto-backup --dry-run   # dev (build local)
QONTO_BACKUP_IMAGE=ghcr.io/tonoid/qonto-backup:v0.1.0 docker compose run --rm qonto-backup   # version pinnée
```

## Idempotence & robustesse

- **Re-run = no-op** si rien n'a changé : check d'existence avant download de chaque PJ.
- `transactions.jsonl` upserté par `id` (re-write atomique du mois entier).
- Cursor `updated_at_from` checkpointé par compte après chaque batch (pas après chaque transaction → granularité raisonnable).
- Tous les writes via `*.tmp` + `rename` atomique → jamais de fichier corrompu.
- Backoff exponentiel sur 429/5xx (`2^n × 500ms`, capé à 30 s, max 5 retries).
- Erreurs par-attachment isolées : un justificatif qui échoue ne bloque pas le sync.

## Format `transactions.jsonl`

Une ligne JSON par transaction, telle que retournée par l'API Qonto (champs `id`, `emitted_at`, `amount`, `currency`, `clean_counterparty_name`, `label`, `reference`, `attachments` embedded, etc.). La ligne est upsertée par `id` à chaque sync : si Qonto met à jour la note, le label, ou attache un nouveau justificatif, le record est réécrit.

Parser un mois entier avec `jq` :

```bash
jq -c . backup/2026/04/transactions.jsonl
```

Calculer le total de débits du mois :

```bash
jq -s '[.[] | select(.side=="debit") | (.amount|tonumber)] | add' \
  backup/2026/04/transactions.jsonl
```

Lister les transactions sans justificatif (utile pour relances mensuelles) :

```bash
jq -c 'select((.attachments|length) == 0)' backup/2026/04/transactions.jsonl
```

## Logs

| Contexte | Format |
|---|---|
| Terminal interactif (TTY) | Coloré, une ligne (`14:56:55 INF snapshot.labels count=24`) |
| Pipe / Docker / Synology Log Center | JSON Lines (auto-détecté via `!isTTY`) |

Forcer le format : `LOG_FORMAT=json` ou `LOG_FORMAT=pretty`.

## FAQ

### Est-ce que cet outil est conforme à l'obligation française de conservation 10 ans ?

Oui. L'article L123-22 du Code de commerce impose la conservation des pièces comptables pendant 10 ans. `qonto-backup` matérialise localement les justificatifs **dans leur format original** (PDF, image) ainsi que la **version probante PAdES signée numériquement** quand elle est disponible. Tu décides ensuite où archiver durablement (NAS chiffré, off-site S3/B2, etc.).

### Mon expert-comptable peut-il l'utiliser pour préparer un FEC ?

Le format `transactions.jsonl` (1 ligne JSON par transaction) est trivial à transformer en FEC (Fichier des Écritures Comptables) avec `jq` ou un script Python par ton expert-comptable. Tous les champs Qonto sont préservés tels quels (`emitted_at`, `amount`, `currency`, `vat_amount`, `label`, `reference`, `clean_counterparty_name`, etc.). Génère le FEC au format texte tabulé exigé par la DGFIP en quelques lignes.

### Que se passe-t-il en cas de contrôle fiscal / URSSAF ?

Tu as immédiatement accès à toutes tes pièces comptables, organisées chronologiquement (`{année}/{mois}/{jour}-{slug}-{id}.pdf`) — sans dépendre de l'app Qonto, de leur disponibilité, ni du temps de réponse de leur support. Les versions PAdES probantes sont stockées à côté pour tout ce qui exige une signature numérique opposable.

### Est-ce que je peux faire confiance à un outil tiers avec ma clé API Qonto ?

Code 100% open-source, MIT, ~1000 lignes lisibles en une heure. Aucune dépendance runtime → pas de risque supply-chain. La clé API ne quitte jamais ta machine : seuls appels sortants vers `thirdparty.qonto.com` (l'API officielle) et les URLs S3 présignées **fournies par Qonto eux-mêmes**.

Le code a été **généré avec Claude Code (Anthropic) puis testé et revu manuellement par un humain** (cf. [Disclaimer](#qonto-backup--sauvegarde-qonto-auto-hébergée-transactions-justificatifs-pades-probants) en haut). C'est volontaire : la base de code reste petite et lisible précisément pour qu'une revue humaine reste praticable. Tu es encouragé·e à lire le code toi-même avant tout usage en production.

### Quelle est la consommation côté API Qonto ?

Le rate limit Qonto est de 1 000 requêtes / 10 secondes par IP. Une synchro complète d'un compte avec 5 000 transactions et 3 000 justificatifs tient largement dans cette enveloppe (séquentiel, pas de parallélisme). Les re-runs incrémentaux ne consomment qu'une poignée de requêtes.

### Et si je ferme mon compte Qonto plus tard, j'aurai toujours mes archives ?

Oui. C'est précisément le but. Une fois sauvegardés, les fichiers sont sur ton disque, dans des formats ouverts (JSON Lines, PDF), interrogeables avec `jq`, ouvrables avec n'importe quel lecteur PDF. Aucune dépendance future à Qonto. Tu reprends le contrôle pour les 10 ans de conservation légale.

### Est-ce que la version PAdES est légalement opposable ?

C'est Qonto qui génère le fichier PAdES (PDF Advanced Electronic Signatures, norme ETSI EN 319 142). `qonto-backup` télécharge le fichier `probative_attachment.url` tel quel, **sans le ré-encoder**. La signature numérique reste intacte → la valeur probante est conservée et opposable en cas de contrôle.

### Pourquoi pas un export CSV manuel via l'application Qonto ?

L'export manuel proposé par Qonto :

- ❌ Ne télécharge pas les pièces jointes en lot (il faut les ouvrir une par une)
- ❌ N'inclut pas la variante PAdES probante
- ❌ N'est pas incrémental (pas de cursor `updated_at_from`)
- ❌ N'est pas automatisable
- ❌ Ne capture pas les labels, bénéficiaires, sous-comptes

Pour 10 ans de conservation obligatoire, ça ne tient pas la route.

### Ça marche avec un Raspberry Pi ou un mini-PC Linux ?

Oui. L'image Docker est multi-architecture (`linux/amd64` + `linux/arm64`). Pour un Raspberry Pi 4 / 5 ou un mini-PC : même procédure que pour un Synology, juste avec `cron` au lieu du Planificateur DSM.

### Qonto change son API, est-ce que ça casse ?

Le code suit la documentation officielle [docs.qonto.com](https://docs.qonto.com). Le format `transactions.jsonl` stocke la réponse Qonto **telle quelle**, donc si Qonto ajoute des champs, ça reste rétro-compatible. Si Qonto fait un breaking change majeur, le projet est mis à jour et une nouvelle version est publiée. Le projet est maintenu activement.

### Comment chiffrer la sauvegarde au repos ?

Hors scope `qonto-backup` (déléguer à la couche stockage) :

- **Synology** : utiliser un dossier partagé chiffré (*DSM → Dossier partagé → Chiffrement*).
- **Linux** : LUKS sur le volume cible.
- **macOS** : FileVault couvre tout le disque par défaut.

### Comment l'envoyer en off-site (S3, Backblaze, Scaleway) ?

Pareil, hors scope. Pipe le dossier `backup/` dans :

- **Hyper Backup** (Synology) — destination S3 / B2 / Scaleway / Wasabi
- **`restic`** — chiffrement client-side, déduplication
- **`rclone`** — réplique vers n'importe quel cloud

Tu obtiens du **3-2-1 backup** : 3 copies (Qonto + NAS + cloud), 2 médias différents, 1 hors-site.

### Mon comptable utilise Pennylane / Indy / Tiime / Cegid, je peux l'intégrer ?

Le format JSON Lines est trivial à transformer pour ces outils. Donne le dossier `backup/` à ton expert-comptable, il pourra l'importer ou écrire un petit script. Si une intégration directe t'intéresse, ouvre une issue.

### Pourquoi pas un format SQLite ou PostgreSQL ?

JSON Lines est plus universel, lisible à l'œil, parsable avec `jq` / `grep`, streamable, et survit à n'importe quelle migration de schéma. Pour de l'analytique avancée, charge le `.jsonl` dans DuckDB en une commande :

```sql
SELECT * FROM read_json_auto('backup/2026/04/transactions.jsonl');
```

DuckDB s'utilise comme SQLite mais lit du JSON Lines nativement. Idéal pour requêtes ad-hoc avant un contrôle.

### J'ai plusieurs entreprises Qonto, comment faire ?

Une instance par organisation. Duplique le dossier `/volume1/docker/qonto-backup` en `qonto-backup-orga1`, `qonto-backup-orga2`, chacune avec son `.env` et sa tâche cron. Les states sont isolés par dossier.

### Combien d'espace disque prévoir ?

Approximativement : **~1 Mo par justificatif** en moyenne (PDF de facture). Pour 100 transactions / mois avec 100 % de justificatifs sur 10 ans : ~12 Go. Le `transactions.jsonl` est négligeable (< 100 Mo pour 100 000 transactions).

## Limites connues

- ❌ Pas de concurrence parallèle des downloads (séquentiel suffit largement vu le rate limit).
- ❌ Pas de backup des cartes physiques / membres (non critique pour la compta).
- ❌ Pas de restauration / import inverse vers Qonto (one-way).
- ❌ Pas de chiffrement at-rest (déléguer à Synology / OS).
- ❌ Pas de notifications (à coupler avec un cron wrapper si besoin).

## Ressources & projets liés

- [Documentation officielle Qonto API](https://docs.qonto.com) — référence des endpoints utilisés.
- [Article L123-22 du Code de commerce](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000019290657/) — obligation de conservation 10 ans.
- [Norme PAdES ETSI EN 319 142](https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.01.01_60/en_31914201v010101p.pdf) — signature numérique des PDF probants.
- [tonoid/sens-marche](https://github.com/tonoid/sens-marche) — projet open-source sibling de l'écosystème tonoid.

## Contribuer

Issues et PRs bienvenues. Le projet vise à rester **petit, lisible, sans dépendance runtime**. Toute PR ajoutant une dépendance npm sera challengée.

```bash
git clone https://github.com/tonoid/qonto-backup.git
cd qonto-backup
npm ci
npm test
npm run build
```

Tu es expert-comptable et tu veux contribuer un script de génération FEC à partir du dossier `backup/` ? Ouvre une PR, c'est le genre d'apport qui aide toute la communauté.

## Licence

[MIT](./LICENSE) — utilisable en commercial, fork-friendly. Projet maintenu par [tonoid](https://github.com/tonoid), une équipe basée en France.

---

**Topics GitHub** : `qonto` `qonto-api` `qonto-backup` `qonto-export` `sauvegarde-qonto` `synology` `synology-nas` `docker` `self-hosted` `auto-hebergement` `comptabilité` `expert-comptable` `fec` `pades` `code-de-commerce` `conservation-10-ans` `souveraineté-données` `rgpd` `node` `typescript` `france`
