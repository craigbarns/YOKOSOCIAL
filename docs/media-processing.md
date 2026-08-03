# Traitement des médias

Le pipeline conserve toujours l’original et produit des variantes immuables pour les recadrages ou
améliorations. Les médias sélectionnés sont copiés vers le stockage de l’application : aucun hotlinking.

## Contrôles

- détection MIME par signature, jamais seulement par extension ;
- limite de 25 Mo et dimensions vérifiées ;
- SHA-256 pour les doublons exacts ;
- dHash 64 bits pour proposer des variantes proches ;
- distance perceptuelle affichée comme candidat, jamais comme preuve de suppression ;
- score déterministe de résolution, luminosité et contraste ;
- potentiels Instagram, Facebook, Story, carrousel et Reel dérivés du score, du ratio et de la
  résolution ;
- recommandation automatique conservée dans les métadonnées, sans jamais valoir approbation.

Tout média issu d’un import entre en `NEEDS_REVIEW`, y compris lorsqu’il obtient un excellent score.
Seule une décision humaine dans l’aperçu d’import peut le faire passer à `APPROVED` ou `REJECTED`.

La netteté, le cadrage esthétique, la présence de texte et les légers recadrages nécessitent une analyse
plus avancée dans le worker. Ils restent explicitement des limites du premier MVP.

## Stockage

`LocalMediaStorageProvider` est réservé à la démonstration et au développement. Les déploiements
Railway ne partagent pas un volume média entre web et worker : la production doit sélectionner
`S3MediaStorageProvider`. Toutes les clés sont préfixées par `organizationId`.
Les clés étant dérivées du SHA-256, le provider local accepte une relance si et seulement si les
octets déjà présents sont identiques ; il refuse tout remplacement divergent.
