# Phase 1 — suites et points ouverts

Date : 2026-08-04
Branche : `claude/yokosocial-client-experience-e86e03`
Portée : de `8ae6491` (main) à la fin de la phase 1, 18 commits.

Ce document conserve ce que l'exécution a mis au jour et qui ne se lit pas dans l'historique
git. Il sert de point de départ à la phase 2.

## 1. Le déploiement sert la démonstration

C'est le point le plus important de tout ce qui suit, et il est indépendant de cette branche.

`https://yokosocial-production.up.railway.app/api/health` répond `{"demoMode":true}`.

| Variable Railway | Valeur | Conséquence |
| --- | --- | --- |
| `DEMO_MODE` | `true` | l'application sert le parcours de démonstration hors ligne |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | l'interface lit `localStorage`, pas la base |
| `AI_MODE` | `real` | configuré, jamais atteint |
| `WEBSITE_IMPORT_MODE` | `real` | configuré, jamais atteint |
| `POSTIZ_MODE` | `mock` | aucune publication ne part |

Chaque page teste `isPublicDemoMode()` et part dans la branche de démonstration. Un utilisateur
peut importer, générer, valider et programmer : tout s'affiche, rien n'est réel, et les données
vivent dans son navigateur.

Basculer `DEMO_MODE=false` ne suffit pas. Il manque :

- `POSTIZ_API_URL` — absente. Sans elle, aucune publication réelle même en `POSTIZ_MODE=real`.
- `S3_ACCESS_KEY_ID` — absente, alors que `S3_ENDPOINT` et `S3_BUCKET` sont définies.

Présentes et correctes : `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `POSTIZ_API_KEY`,
`APP_URL`, `BETTER_AUTH_URL`, `AUTH_SECRET`, `BETTER_AUTH_SECRET`.

`NEXT_PUBLIC_DEMO_MODE` est figée à la compilation : la changer exige un redéploiement, pas un
redémarrage.

## 2. Avant de déployer cette branche

Le commit `5f9fccb` durcit l'authentification : une instance mal configurée refuse désormais de
démarrer au lieu de retomber silencieusement sur un secret en dur lisible dans ce dépôt public.
Deux vérifications avant mise en service :

- `BETTER_AUTH_TRUSTED_ORIGINS` : si elle existe et contient une entrée en `http://`,
  `resolveTrustedOrigins` lève désormais au lieu de réécrire en `https://`, et toute mutation
  répondra 503. La variable n'est documentée nulle part et semble absente ; la vérifier coûte
  trente secondes.
- Tout environnement qui tournait réellement sur l'ancien secret par défaut verra ses sessions
  invalidées. Vérifié : ce n'est pas le cas de la production Railway, dont le secret fait
  41 caractères.

## 3. Environnement de développement

Le `node` par défaut de la machine de développement était `v23.6.0`, hors de la plage exigée
(`^20.19 || ^22.12 || >=24 <25`). Sous cette version, `npm install` échoue sur l'étape
d'installation de Prisma et laisse le dépôt sans `node_modules` racine ; ESLint se met alors à
signaler des erreurs de typage inexistantes sur du code correct.

Utiliser la version du `.nvmrc` avant toute commande npm :

```bash
nvm use
```

## 4. Points différés, triés par la revue finale

À traiter quand le fichier concerné est rouvert, aucun ne bloque l'intégration.

- `today-page.tsx` : l'état local redéclare `{ snapshot, action }` alors que `TodayResponse`
  existe dans `lib/today-contract.ts` pour cela.
- `today-page.tsx` : bref rendu où l'écran n'affiche que son en-tête, entre la résolution de
  l'espace de travail et le premier appel réseau. Ajouter `(!!workspace && !payload && !error)`
  à la condition `busy`.
- `api/today/route.ts` : pas d'en-tête `Cache-Control: private, no-store` sur une réponse
  mono-locataire. Six autres routes du dépôt le posent ; `/api/posts`, dont celle-ci est le
  calque, ne le pose pas.
- `today-snapshot-demo.ts` : en démonstration, les compteurs validés ignorent
  `selectedProductIds` / `selectedMediaIds`. Si l'utilisateur décoche un plat à l'aperçu,
  « Aujourd'hui » annonce un chiffre supérieur au reste de l'application.
- `lib/auth.ts` : la détection de gabarit cherche littéralement `${{REF}}` ; une référence
  Railway non résolue s'écrit `${{Service.VARIABLE}}`. Une expression régulière
  `/\$\{\{[^}]+\}\}/` couvrirait le cas réel. Pré-existant.
- `lib/auth.test.ts` : aucun test ne fixe le contrat côté développement — ni que le repli est
  bien utilisé hors production, ni qu'il reste inatteignable en production.
- `today-snapshot-demo.test.ts` : un `as DemoState["posts"]` contourne le type réel ; une petite
  fabrique de `DemoPost` vaudrait mieux.
- `week-strip.tsx` : « vos N dernières corrections » affiche un cumul depuis toujours, sans borne
  temporelle. Le mot « dernières » promet plus que le compteur ne tient. La phase 5 refait ce
  calcul.
- Formulations : « Collons votre site. » se lit mal comme appel à l'action ; le suffixe
  systématique « (s) » est mécanique pour le registre visé. Toute retouche doit mettre à jour
  `tests/e2e/today.spec.ts`, qui épingle ces textes.
- Accessibilité : les icônes `lucide-react` n'ont pas d'`aria-hidden` ; le texte adjacent porte
  le sens.
- Contrat anticipé : `IMPORT_WEBSITE.websiteUrl`, `posts.approved` et `posts.scheduled` ne sont
  lus par aucun composant. Ils existent pour les phases 2 et 5 ; à supprimer si ces phases ne les
  consomment pas.

## 5. Leçon pour la rédaction du plan de la phase 2

La revue finale a pris le plan de la phase 1 en défaut six fois, toujours de la même façon :
**le plan écrivait du code verbatim sans le confronter aux pages et aux états réellement présents
en aval.** D'où un bouton « Tout valider » pointant vers une page qui affiche « Aucun produit
importé » dans l'état même que la carte décrivait, et un statut `NEEDS_REVIEW` produit par deux
constructeurs mais lu par personne.

Contre-mesure à appliquer au plan de la phase 2 : pour chaque appel à l'action, exiger une ligne
**« destination vérifiée : voici ce que fait cette page dans cet état »**. Et pour chaque valeur
qu'un type peut prendre, exiger un test qui la traverse.

## 6. Couverture de test connue comme incomplète

Trois composants d'interface n'ont pas de test unitaire : le dépôt n'a pas d'environnement de
test de composants React. Ils sont couverts par `tests/e2e/today.spec.ts`, qui traverse désormais
les quatre états atteignables en démonstration. Ajouter un tel environnement dépasse le cadre de
la phase 1 et mérite d'être décidé pour la phase 2, où « Ma semaine » ajoutera beaucoup
d'interface.
