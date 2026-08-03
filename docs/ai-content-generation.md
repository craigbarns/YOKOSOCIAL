# Génération de contenu

`ContentGenerationService` sépare le domaine du fournisseur d’IA. Il reçoit uniquement des produits,
établissements, promotions et médias connus. Toute réponse est validée par Zod puis contrôlée contre
les identifiants autorisés.

## Providers

- `MockContentGenerationProvider` : cinq propositions déterministes, sans clé et hors ligne.
- `OpenAIContentGenerationProvider` : Responses API, JSON structuré, clé uniquement côté serveur.

Le mode réel ne doit jamais retomber silencieusement sur le mock. Une configuration incomplète doit
échouer explicitement.

## Anti-hallucination

- Les IDs d’établissement et de média sont recoupés.
- Les informations locales non validées génèrent un avertissement.
- Une promotion, un prix ou un avis ne doit apparaître que dans le contexte validé.
- Toute modification après approbation crée une nouvelle version et exige une nouvelle validation.

Zod contrôle la forme, pas la vérité. Le contrôle de grounding reste donc obligatoire après la réponse
du modèle.
