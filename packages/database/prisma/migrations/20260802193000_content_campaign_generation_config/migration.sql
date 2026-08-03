-- Persist the bounded, validated request consumed by the asynchronous content worker.
ALTER TABLE "ContentCampaign" ADD COLUMN "generationConfig" JSONB;
