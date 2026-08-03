-- The API performs a friendly preflight, but PostgreSQL must arbitrate concurrent requests.
-- An import waiting for human review remains active: starting another one would mix candidates.
CREATE UNIQUE INDEX "WebsiteImport_one_active_per_brand"
ON "WebsiteImport" ("organizationId", "brandId")
WHERE "status" IN (
  'PENDING',
  'CRAWLING',
  'ANALYZING',
  'WAITING_FOR_REVIEW',
  'IMPORTING'
);
