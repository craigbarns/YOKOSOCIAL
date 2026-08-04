# Refonte de l'expérience client — design

Date : 2026-08-04
Statut : validé, prêt pour le plan d'implémentation

## Problème

L'application est aujourd'hui un outil d'opérateur présenté à des restaurateurs.

- La navigation compte neuf entrées, dont six exposent la mécanique interne : import du
  site, établissements, carte et produits, médiathèque, comptes sociaux, publications.
- Le parcours réel impose sept concepts avant la première publication : organisation,
  marque, import, validation du catalogue, génération, approbation, programmation Postiz.
- Le tableau de bord empile un guide en trois étapes, quatre indicateurs, un brief
  hebdomadaire, une carte bibliothèque et deux cartes d'état. Rien n'indique la seule
  chose à faire maintenant.
- Les erreurs partielles remontent telles quelles : « Certaines données réelles n'ont pas
  pu être chargées : publications, médias. »
- L'onboarding pré-remplit « YokoSushi » et `yokosushi.fr` en dur.
- `real-posts-page.tsx` fait 1347 lignes et `real-import-page.tsx` 968, avec état, appels
  réseau et rendu mélangés. Toute amélioration d'interface y est risquée.

## Utilisateur cible

Un restaurateur indépendant, en self-service. Il s'inscrit seul, ne connaît ni le
marketing ni la technique, et n'aura jamais de formation. Chaque concept à expliquer est
un client perdu.

## Rituel cible

Cinq minutes le lundi. L'application prépare la semaine, le restaurateur fait défiler les
publications et tranche. Rien ne part sans son accord — cette règle existe déjà dans le
code et reste inchangée.

## Activation

Le restaurateur ne fournit que l'URL de son site. Aucune question de goût à l'inscription.
Le ton se cale sur ce qu'il valide, passe et retouche, semaine après semaine.

## Architecture retenue : trois pièces

Navigation réduite à trois entrées plus un avatar :

```
Aujourd'hui   ·   Ma semaine   ·   Calendrier              ⟨avatar⟩
```

Correspondance avec l'existant :

| Page actuelle                             | Devient                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `/dashboard`                              | **Aujourd'hui**                                                 |
| `/posts`                                  | **Ma semaine**                                                  |
| `/calendar`                               | **Calendrier**, simplifié                                       |
| `/import`                                 | une étape vivante dans Aujourd'hui, jamais une page à visiter    |
| `/products`, `/media`, `/establishments`  | des panneaux contextuels ouverts depuis une publication          |
| `/social-accounts`                        | une section de Réglages                                          |
| `/onboarding`                             | un champ unique, sans valeur pré-remplie                         |

Aucune capacité n'est retirée. Elles cessent d'occuper un menu permanent et apparaissent
au moment où elles servent.

### Pièce 1 — Aujourd'hui

Un écran qui ne pose qu'une question à la fois. Son contenu est calculé depuis l'état réel
du compte :

| État du compte                     | Ce que voit le restaurateur                                    |
| ---------------------------------- | -------------------------------------------------------------- |
| Aucun import                       | « Collons votre site. » — un champ, un bouton                   |
| Import en cours                    | Progression : 12 pages lues · 28 plats trouvés · 64 photos      |
| Catalogue à valider                | « 42 plats et 64 photos. » → Tout valider / Regarder en détail  |
| Publications en attente            | « 5 publications vous attendent. 3 minutes. » → Commencer       |
| Aucun compte social connecté       | « Plus qu'une chose : connecter Instagram. »                    |
| Rien à faire                       | « Tout est en ordre. Prochaine publication mardi 12h. »         |
| Échec d'import ou de génération    | Une phrase en français clair et un bouton pour reprendre        |

Sous cette carte : une bande de la semaine à venir et deux chiffres au maximum. Le guide
en trois étapes, les quatre indicateurs et le brief hebdomadaire actuels disparaissent —
ils se disputent l'attention.

### Pièce 2 — Ma semaine

Le rituel du lundi. Plein écran, une publication à la fois, l'aperçu Instagram ou Facebook
en grand. Trois actions, jamais plus :

```
   ┌──────────────────────┐
   │  [aperçu Instagram]  │        2 sur 5  ●●○○○
   │                      │
   │  « Le plateau du     │
   │    vendredi… »       │
   └──────────────────────┘

   ✓ Valider      → Passer      ✎ Retoucher
```

« Retoucher » ouvre un panneau sur place — texte, photo, date — jamais une autre page.
Fin de parcours : « Votre semaine est prête. 5 publications entre mardi et dimanche. »

Correspondance avec les transitions existantes :

- Valider → `POST /api/posts/[postId]/transition` (approbation), comportement inchangé.
- Retoucher puis enregistrer → mise à jour de la publication, ce qui crée une nouvelle
  version et repasse en `DRAFT`, comme aujourd'hui.
- Passer → aucun changement d'état côté publication ; un signal est enregistré (voir
  boucle d'apprentissage).

### Pièce 3 — Calendrier

Vue mensuelle, glisser-déposer pour décaler une publication, clic pour ouvrir le même
panneau de retouche que dans Ma semaine.

### Réglages

Accessibles depuis l'avatar, en sections : identité de marque, comptes sociaux, jours et
heures de publication, équipe.

## Le résolveur d'action

Une fonction pure dans `packages/shared/src/next-action.ts`. Entrée : un instantané du
compte (compteurs et statuts). Sortie : une action typée. Ni React, ni accès base de
données, donc testable exhaustivement — chaque état possible vers l'action attendue.

Elle est alimentée par une route unique `GET /api/today`, assemblée côté serveur.
Aujourd'hui, le tableau de bord lance quatre requêtes en parallèle et gère leurs échecs
partiels ; l'appel unique supprime la majorité de ces cas.

Règle sur les erreurs restantes : tout échec devient une phrase actionnable accompagnée
d'un bouton. Aucune énumération technique n'est montrée au restaurateur.

## Boucle d'apprentissage

Les fondations existent : un rejet écrit un `UserFeedback`
(`apps/web/app/api/posts/[postId]/transition/route.ts`) et le worker réinjecte ces
messages dans le prompt de génération (`apps/worker/src/processors/content-generation.ts`).
On enrichit ce qui est capté, sans modifier le schéma Prisma.

- **Retoucher** est le signal le plus riche : on compare le texte généré au texte
  enregistré et on stocke l'avant/après dans `UserFeedback.metadata`.
- **Passer** trois fois le même sujet ou le même produit écrit un signal de lassitude.
- **Rejeter** continue d'écrire un `FeedbackReason`.
- Toutes les dix validations, un job condense ces signaux dans des champs `BrandProfile`
  déjà présents : `customInstruction`, `wordsToAvoid`, `allowedExpressions`, `tones`,
  `emojiUsageLevel`.
- Les photos des publications validées incrémentent `usageCount` ; celles rejetées pour
  `WRONG_PHOTO` reculent dans la sélection.

L'apprentissage doit être perceptible. Une ligne discrète sur Aujourd'hui — « Ces
publications tiennent compte de vos 12 dernières corrections » — rend la promesse
vérifiable par le client.

## Découpage du code

Règle : aucun composant au-dessus d'environ 250 lignes, et les appels réseau sortent des
composants vers une couche `lib/api/*.ts` typée.

Structure visée :

```
packages/shared/src/next-action.ts        fonction pure, état → action
apps/web/lib/api/today.ts                 appel et types de /api/today
apps/web/lib/api/posts.ts                 transitions, mise à jour, programmation
apps/web/components/today/                carte d'action, bande de semaine
apps/web/components/week/week-flow.tsx    machine à états du parcours
apps/web/components/week/post-preview.tsx rendu Instagram et Facebook
apps/web/components/week/retouch-panel.tsx édition texte, photo, date
apps/web/components/panels/               médias, produits, établissements
```

`real-posts-page.tsx` et `real-import-page.tsx` sont démontés au fil des phases qui les
remplacent, pas dans un chantier séparé.

## Mobile

Le restaurateur valide sa semaine sur son téléphone, entre deux services. Le parcours de
validation est dimensionné au pouce dès la conception, pas adapté ensuite.

## Ce qui est retiré

- Le pré-remplissage « YokoSushi » et `yokosushi.fr` de l'onboarding.
- Le mode démo branché en condition dans chaque page : il redevient une source de données
  derrière la même couche API, sans embranchement dans les composants.

## Tests

- Vitest : le résolveur d'action, état par état ; l'agrégation des signaux de feedback ;
  la condensation vers `BrandProfile`.
- Playwright : le rituel complet — connexion, Aujourd'hui, validation de cinq
  publications, vérification au calendrier.
- `npm run check` (lint, typecheck, tests) reste la barrière avant chaque déploiement.

## Phases

Chaque phase est déployable seule sur Railway. L'ancien écran reste servi tant que le
nouveau n'est pas basculé.

1. `GET /api/today`, le résolveur d'action, l'écran **Aujourd'hui**.
2. **Ma semaine** et le panneau de retouche ; démontage de `real-posts-page.tsx`.
3. Panneaux contextuels médias, produits, établissements ; sortie de ces pages du menu.
4. Réglages unifiés et onboarding à un champ.
5. Boucle d'apprentissage enrichie et dérivation du `BrandProfile`.
6. Calendrier glisser-déposer et finition mobile.

## Décisions par défaut

Ces points n'ont pas été tranchés explicitement ; ils sont retenus ainsi et peuvent être
revus.

- **Un seul établissement par défaut.** Le sélecteur d'établissement n'apparaît que si
  l'import en détecte plusieurs. Le modèle multi-établissement du schéma reste intact.
- **Programmation automatique des jours et heures.** L'application propose un créneau ; le
  restaurateur le change dans le panneau de retouche ou dans Réglages. Aucune question à
  l'inscription.
- **Le mode démo reste fonctionnel** pendant toute la refonte, y compris le parcours
  hors ligne décrit dans le README.
