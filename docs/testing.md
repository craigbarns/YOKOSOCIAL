# Tests

## Commandes

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Utiliser Node 22.18.0 (`nvm use`) ou une version explicitement compatible avec Prisma 7. Les versions
Node impaires ne sont pas supportées par Prisma 7/Vitest 4.

## Couverture actuelle

- schémas de génération structurée ;
- transitions de validation et garde d’approbation ;
- variables d’environnement et expurgation des secrets ;
- SHA-256, dHash, distance perceptuelle et scoring média ;
- extraction HTML/JSON-LD/OG/CSS et réponses JSON YokoSushi ;
- protections SSRF, DNS/IP privées, redirections, robots et erreurs partielles ;
- provider Postiz mock : succès, erreur, publication différée, état ambigu et analytics ;
- client Postiz réel avec réponses Zod et erreurs assainies ;
- filtres multi-tenant purs ;
- parcours E2E démonstration complet.

Les tests réseau live sont exclus du CI. Ils doivent rester opt-in afin de respecter le site, éviter les
tests instables et ne jamais consommer de clés réelles par défaut.

## E2E

Playwright démarre le monorepo en mode démo et couvre :

```text
inscription → organisation → import → sélection → génération
→ modification → validation → approbation → programmation Postiz mock → calendrier
```

Installer le navigateur une seule fois si nécessaire :

```bash
npx playwright install chromium
```

Les traces, vidéos et captures ne sont conservées qu’en cas d’échec et sont ignorées par Git.

## Intégration PostgreSQL

Les tests qui utilisent réellement Prisma doivent recevoir une base PostgreSQL éphémère et séparée.
Ne jamais pointer `DATABASE_URL` de test vers Supabase Production. La prochaine étape recommandée est un
job CI avec service PostgreSQL, migration puis tests d’isolation cross-tenant transactionnels.
