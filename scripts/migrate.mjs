#!/usr/bin/env node
/**
 * Standalone database migration script.
 * Uses `pg` directly (no Prisma CLI) to create all tables.
 * Runs before the Next.js server on Railway startup.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[migrate] ERROR: DATABASE_URL not set');
  process.exit(1);
}

console.log('[migrate] Connecting to database...');

// No SSL for Railway internal network (postgres.railway.internal)
const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  console.log('[migrate] Connected! Running migration...');

  await client.query(`
-- Enums
DO $$ BEGIN CREATE TYPE "OrganizationRole" AS ENUM ('OWNER','ADMIN','EDITOR','REVIEWER','VIEWER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "EstablishmentStatus" AS ENUM ('ACTIVE','INACTIVE','NEEDS_REVIEW','ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM','FACEBOOK'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SocialAccountStatus" AS ENUM ('DISCONNECTED','CONNECTED','EXPIRED','ERROR'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "WebsiteImportMode" AS ENUM ('REAL','MOCK','DEMO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "WebsiteImportStatus" AS ENUM ('PENDING','CRAWLING','ANALYZING','WAITING_FOR_REVIEW','IMPORTING','COMPLETED','PARTIALLY_COMPLETED','FAILED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "WebsitePageStatus" AS ENUM ('DISCOVERED','FETCHING','FETCHED','ANALYZED','PARTIAL','SKIPPED','FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "WebsitePageType" AS ENUM ('HOME','MENU','CATEGORY','PRODUCT','ESTABLISHMENT','CONTACT','ORDER','PROMOTION','SITEMAP','OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ImportedDataType" AS ENUM ('BRAND','LOGO','BRAND_TEXT','ESTABLISHMENT','ADDRESS','PHONE','BUSINESS_HOURS','SERVICE','ORDER_LINK','RESERVATION_LINK','SOCIAL_LINK','PRODUCT_CATEGORY','PRODUCT','PRICE','ALLERGEN','PROMOTION','OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DataValidationStatus" AS ENUM ('UNREVIEWED','APPROVED','REJECTED','SUPERSEDED','SOURCE_NOT_FOUND'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MediaCategory" AS ENUM ('LOGO','PRODUCT','PLATTER','RESTAURANT','AMBIANCE','TEAM','DELIVERY','PROMOTION','DECORATION','TECHNICAL','UNCLASSIFIED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MediaEditorialCategory" AS ENUM ('SUSHI','MAKI','CALIFORNIA','SASHIMI','NIGIRI','POKE','PLATTER','MENU','DESSERT','DRINK','RESTAURANT','TERRACE','AMBIANCE','TEAM','DELIVERY','LOGO','PROMOTION','UNCLASSIFIED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MediaStatus" AS ENUM ('APPROVED','NEEDS_REVIEW','LOW_QUALITY','REJECTED','ARCHIVED','SOURCE_NOT_FOUND'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MediaVariantKind" AS ENUM ('CROP','RESIZE','ENHANCED','INSTAGRAM_FEED','INSTAGRAM_STORY','FACEBOOK_FEED','THUMBNAIL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MediaTagOrigin" AS ENUM ('IMPORTED','AI','MANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MenuItemStatus" AS ENUM ('DRAFT','ACTIVE','UNAVAILABLE','NEEDS_REVIEW','ARCHIVED','SOURCE_NOT_FOUND'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT','PENDING_REVIEW','ACTIVE','EXPIRED','REJECTED','ARCHIVED','SOURCE_NOT_FOUND'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BrandTone" AS ENUM ('PREMIUM','GOURMAND','WARM','TRENDY','FAMILY','MODERN','DYNAMIC','HUMOROUS','SOBER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT','ACTIVE','PAUSED','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ContentFormat" AS ENUM ('IMAGE','CAROUSEL','STORY','REEL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ContentTopic" AS ENUM ('PRODUCT','PLATTER','RESTAURANT','AMBIANCE','PROMOTION','DELIVERY','BEHIND_THE_SCENES','TEAM','SEASONAL','LOCAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ContentIdeaStatus" AS ENUM ('DRAFT','SELECTED','USED','REJECTED','ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PostAudienceScope" AS ENUM ('BRAND','SELECTED_ESTABLISHMENTS'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT','PENDING_REVIEW','APPROVED','SCHEDULED','PUBLISHING','PUBLISHED','REJECTED','FAILED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PostVersionOrigin" AS ENUM ('AI','MANUAL','REGENERATION','DUPLICATION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PostMediaRole" AS ENUM ('PRIMARY','CAROUSEL_SLIDE','STORY_FRAME','REEL_REFERENCE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PublicationJobStatus" AS ENUM ('PENDING','SCHEDULED','PROCESSING','PUBLISHED','FAILED','CANCELLED','UNCERTAIN'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PublicationAttemptStatus" AS ENUM ('STARTED','SUCCEEDED','FAILED','RETRY_SCHEDULED','UNCERTAIN','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FeedbackTarget" AS ENUM ('SOCIAL_POST','CONTENT_IDEA','MEDIA_ASSET','IMPORT','GENERAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FeedbackReason" AS ENUM ('TEXT_TOO_LONG','TEXT_TOO_GENERIC','WRONG_PHOTO','WRONG_PRODUCT','WRONG_INFORMATION','WRONG_DATE','WRONG_TONE','OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AuditAction" AS ENUM ('CREATE','UPDATE','DELETE','IMPORT','APPROVE','REJECT','SCHEDULE','CANCEL','PUBLISH','LOGIN','LOGOUT','EXPORT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Core auth tables (Better Auth)
CREATE TABLE IF NOT EXISTS "user" ("id" TEXT NOT NULL,"name" TEXT NOT NULL,"email" TEXT NOT NULL,"emailVerified" BOOLEAN NOT NULL DEFAULT false,"image" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "user_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_key" ON "user"("email");
CREATE INDEX IF NOT EXISTS "user_createdAt_idx" ON "user"("createdAt");

CREATE TABLE IF NOT EXISTS "session" ("id" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"token" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"ipAddress" TEXT,"userAgent" TEXT,"userId" TEXT NOT NULL, CONSTRAINT "session_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_key" ON "session"("token");
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");
CREATE INDEX IF NOT EXISTS "session_createdAt_idx" ON "session"("createdAt");

CREATE TABLE IF NOT EXISTS "account" ("id" TEXT NOT NULL,"accountId" TEXT NOT NULL,"providerId" TEXT NOT NULL,"userId" TEXT NOT NULL,"accessToken" TEXT,"refreshToken" TEXT,"idToken" TEXT,"accessTokenExpiresAt" TIMESTAMP(3),"refreshTokenExpiresAt" TIMESTAMP(3),"scope" TEXT,"password" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "account_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key" ON "account"("providerId","accountId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");
CREATE INDEX IF NOT EXISTS "account_createdAt_idx" ON "account"("createdAt");

CREATE TABLE IF NOT EXISTS "verification" ("id" TEXT NOT NULL,"identifier" TEXT NOT NULL,"value" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "verification_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier");
CREATE INDEX IF NOT EXISTS "verification_createdAt_idx" ON "verification"("createdAt");

-- Organization
CREATE TABLE IF NOT EXISTS "Organization" ("id" TEXT NOT NULL,"name" TEXT NOT NULL,"slug" TEXT NOT NULL,"logo" TEXT,"metadata" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Organization_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

CREATE TABLE IF NOT EXISTS "OrganizationMember" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"role" "OrganizationRole" NOT NULL DEFAULT 'VIEWER',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId","userId");
CREATE INDEX IF NOT EXISTS "OrganizationMember_organizationId_idx" ON "OrganizationMember"("organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- Brand & Establishment
CREATE TABLE IF NOT EXISTS "RestaurantBrand" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"name" TEXT NOT NULL,"slug" TEXT NOT NULL,"websiteUrl" VARCHAR(2048),"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RestaurantBrand_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantBrand_organizationId_slug_key" ON "RestaurantBrand"("organizationId","slug");
CREATE INDEX IF NOT EXISTS "RestaurantBrand_organizationId_idx" ON "RestaurantBrand"("organizationId");

CREATE TABLE IF NOT EXISTS "Establishment" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"name" TEXT NOT NULL,"slug" TEXT NOT NULL,"address" TEXT,"city" TEXT,"postalCode" TEXT,"country" TEXT,"latitude" DOUBLE PRECISION,"longitude" DOUBLE PRECISION,"phone" TEXT,"email" TEXT,"websiteUrl" VARCHAR(2048),"googlePlaceId" TEXT,"status" "EstablishmentStatus" NOT NULL DEFAULT 'ACTIVE',"businessHours" JSONB,"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "Establishment_organizationId_slug_key" ON "Establishment"("organizationId","slug");
CREATE INDEX IF NOT EXISTS "Establishment_organizationId_idx" ON "Establishment"("organizationId");
CREATE INDEX IF NOT EXISTS "Establishment_brandId_idx" ON "Establishment"("brandId");

-- Social Accounts
CREATE TABLE IF NOT EXISTS "SocialAccount" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"establishmentId" TEXT,"platform" "SocialPlatform" NOT NULL,"platformAccountId" TEXT NOT NULL,"name" TEXT NOT NULL,"profilePictureUrl" TEXT,"status" "SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',"accessToken" TEXT,"refreshToken" TEXT,"tokenExpiresAt" TIMESTAMP(3),"scopes" TEXT[],"metadata" JSONB,"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_organizationId_platform_platformAccountId_key" ON "SocialAccount"("organizationId","platform","platformAccountId");
CREATE INDEX IF NOT EXISTS "SocialAccount_organizationId_idx" ON "SocialAccount"("organizationId");
CREATE INDEX IF NOT EXISTS "SocialAccount_establishmentId_idx" ON "SocialAccount"("establishmentId");

-- Website Import
CREATE TABLE IF NOT EXISTS "WebsiteImport" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"url" VARCHAR(2048) NOT NULL,"mode" "WebsiteImportMode" NOT NULL DEFAULT 'REAL',"status" "WebsiteImportStatus" NOT NULL DEFAULT 'PENDING',"pagesDiscovered" INTEGER NOT NULL DEFAULT 0,"pagesCrawled" INTEGER NOT NULL DEFAULT 0,"pagesAnalyzed" INTEGER NOT NULL DEFAULT 0,"itemsExtracted" INTEGER NOT NULL DEFAULT 0,"errorMessage" TEXT,"startedAt" TIMESTAMP(3),"completedAt" TIMESTAMP(3),"createdById" TEXT,"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WebsiteImport_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "WebsiteImport_organizationId_idx" ON "WebsiteImport"("organizationId");
CREATE INDEX IF NOT EXISTS "WebsiteImport_brandId_idx" ON "WebsiteImport"("brandId");

CREATE TABLE IF NOT EXISTS "WebsitePage" ("id" TEXT NOT NULL,"importId" TEXT NOT NULL,"url" VARCHAR(2048) NOT NULL,"type" "WebsitePageType" NOT NULL DEFAULT 'OTHER',"status" "WebsitePageStatus" NOT NULL DEFAULT 'DISCOVERED',"depth" INTEGER NOT NULL DEFAULT 0,"rawHtml" TEXT,"cleanedText" TEXT,"errorMessage" TEXT,"crawledAt" TIMESTAMP(3),"analyzedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WebsitePage_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "WebsitePage_importId_url_key" ON "WebsitePage"("importId","url");
CREATE INDEX IF NOT EXISTS "WebsitePage_importId_idx" ON "WebsitePage"("importId");

CREATE TABLE IF NOT EXISTS "ImportedData" ("id" TEXT NOT NULL,"importId" TEXT NOT NULL,"pageId" TEXT,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"establishmentId" TEXT,"type" "ImportedDataType" NOT NULL,"rawValue" TEXT NOT NULL,"normalizedValue" JSONB,"confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,"validationStatus" "DataValidationStatus" NOT NULL DEFAULT 'UNREVIEWED',"validationNote" TEXT,"isApplied" BOOLEAN NOT NULL DEFAULT false,"appliedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ImportedData_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "ImportedData_importId_idx" ON "ImportedData"("importId");
CREATE INDEX IF NOT EXISTS "ImportedData_organizationId_idx" ON "ImportedData"("organizationId");
CREATE INDEX IF NOT EXISTS "ImportedData_brandId_idx" ON "ImportedData"("brandId");
CREATE INDEX IF NOT EXISTS "ImportedData_type_idx" ON "ImportedData"("type");

-- Media
CREATE TABLE IF NOT EXISTS "MediaAsset" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"establishmentId" TEXT,"importId" TEXT,"sourceUrl" VARCHAR(2048),"storagePath" TEXT,"publicUrl" TEXT,"mimeType" TEXT,"fileSizeBytes" INTEGER,"width" INTEGER,"height" INTEGER,"blurHash" TEXT,"category" "MediaCategory" NOT NULL DEFAULT 'UNCLASSIFIED',"editorialCategory" "MediaEditorialCategory","status" "MediaStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',"caption" TEXT,"altText" TEXT,"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "MediaAsset_organizationId_idx" ON "MediaAsset"("organizationId");
CREATE INDEX IF NOT EXISTS "MediaAsset_brandId_idx" ON "MediaAsset"("brandId");
CREATE INDEX IF NOT EXISTS "MediaAsset_status_idx" ON "MediaAsset"("status");

CREATE TABLE IF NOT EXISTS "MediaVariant" ("id" TEXT NOT NULL,"assetId" TEXT NOT NULL,"kind" "MediaVariantKind" NOT NULL,"storagePath" TEXT NOT NULL,"publicUrl" TEXT,"width" INTEGER,"height" INTEGER,"fileSizeBytes" INTEGER,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MediaVariant_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "MediaVariant_assetId_idx" ON "MediaVariant"("assetId");

CREATE TABLE IF NOT EXISTS "MediaTag" ("id" TEXT NOT NULL,"assetId" TEXT NOT NULL,"tag" TEXT NOT NULL,"origin" "MediaTagOrigin" NOT NULL DEFAULT 'MANUAL',"confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MediaTag_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "MediaTag_assetId_tag_key" ON "MediaTag"("assetId","tag");
CREATE INDEX IF NOT EXISTS "MediaTag_assetId_idx" ON "MediaTag"("assetId");

-- Menu
CREATE TABLE IF NOT EXISTS "MenuCategory" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"importId" TEXT,"name" TEXT NOT NULL,"slug" TEXT NOT NULL,"position" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "MenuCategory_brandId_slug_key" ON "MenuCategory"("brandId","slug");
CREATE INDEX IF NOT EXISTS "MenuCategory_brandId_idx" ON "MenuCategory"("brandId");

CREATE TABLE IF NOT EXISTS "MenuItem" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"categoryId" TEXT,"importId" TEXT,"name" TEXT NOT NULL,"slug" TEXT NOT NULL,"description" TEXT,"price" DOUBLE PRECISION,"currency" TEXT NOT NULL DEFAULT 'EUR',"allergens" TEXT[],"isAvailable" BOOLEAN NOT NULL DEFAULT true,"status" "MenuItemStatus" NOT NULL DEFAULT 'ACTIVE',"position" INTEGER NOT NULL DEFAULT 0,"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "MenuItem_brandId_slug_key" ON "MenuItem"("brandId","slug");
CREATE INDEX IF NOT EXISTS "MenuItem_brandId_idx" ON "MenuItem"("brandId");
CREATE INDEX IF NOT EXISTS "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

CREATE TABLE IF NOT EXISTS "MenuItemMedia" ("id" TEXT NOT NULL,"menuItemId" TEXT NOT NULL,"mediaAssetId" TEXT NOT NULL,"isPrimary" BOOLEAN NOT NULL DEFAULT false,"position" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MenuItemMedia_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "MenuItemMedia_menuItemId_mediaAssetId_key" ON "MenuItemMedia"("menuItemId","mediaAssetId");

-- Brand Profile
CREATE TABLE IF NOT EXISTS "BrandProfile" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"targetAudience" TEXT,"brandPersonality" TEXT,"uniqueValueProposition" TEXT,"brandVoice" TEXT,"tones" "BrandTone"[],"hashtags" TEXT[],"contentPillars" TEXT[],"colorPalette" TEXT[],"fontPairings" TEXT[],"logoUrl" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "BrandProfile_brandId_key" ON "BrandProfile"("brandId");

-- Promotions
CREATE TABLE IF NOT EXISTS "Promotion" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"establishmentId" TEXT,"importId" TEXT,"title" TEXT NOT NULL,"description" TEXT,"discountType" TEXT,"discountValue" DOUBLE PRECISION,"discountCode" TEXT,"startsAt" TIMESTAMP(3),"endsAt" TIMESTAMP(3),"status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "Promotion_organizationId_idx" ON "Promotion"("organizationId");
CREATE INDEX IF NOT EXISTS "Promotion_brandId_idx" ON "Promotion"("brandId");

-- Content
CREATE TABLE IF NOT EXISTS "ContentCampaign" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"name" TEXT NOT NULL,"description" TEXT,"status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',"startsAt" TIMESTAMP(3),"endsAt" TIMESTAMP(3),"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ContentCampaign_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "ContentCampaign_organizationId_idx" ON "ContentCampaign"("organizationId");
CREATE INDEX IF NOT EXISTS "ContentCampaign_brandId_idx" ON "ContentCampaign"("brandId");

CREATE TABLE IF NOT EXISTS "ContentCampaignEstablishment" ("id" TEXT NOT NULL,"contentCampaignId" TEXT NOT NULL,"establishmentId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ContentCampaignEstablishment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "ContentCampaignEstablishment_contentCampaignId_establishmentId_key" ON "ContentCampaignEstablishment"("contentCampaignId","establishmentId");

CREATE TABLE IF NOT EXISTS "ContentIdea" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"contentCampaignId" TEXT,"topic" "ContentTopic" NOT NULL,"format" "ContentFormat" NOT NULL,"title" TEXT,"description" TEXT,"status" "ContentIdeaStatus" NOT NULL DEFAULT 'DRAFT',"aiPromptUsed" TEXT,"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "ContentIdea_organizationId_idx" ON "ContentIdea"("organizationId");
CREATE INDEX IF NOT EXISTS "ContentIdea_brandId_idx" ON "ContentIdea"("brandId");

CREATE TABLE IF NOT EXISTS "ContentIdeaEstablishment" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"contentIdeaId" TEXT NOT NULL,"establishmentId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ContentIdeaEstablishment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "ContentIdeaEstablishment_contentIdeaId_establishmentId_key" ON "ContentIdeaEstablishment"("contentIdeaId","establishmentId");

-- Social Posts
CREATE TABLE IF NOT EXISTS "SocialPost" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT NOT NULL,"contentCampaignId" TEXT,"contentIdeaId" TEXT,"status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',"audienceScope" "PostAudienceScope" NOT NULL DEFAULT 'BRAND',"scheduledAt" TIMESTAMP(3),"publishedAt" TIMESTAMP(3),"createdById" TEXT,"approvedById" TEXT,"isDemo" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "SocialPost_organizationId_idx" ON "SocialPost"("organizationId");
CREATE INDEX IF NOT EXISTS "SocialPost_brandId_idx" ON "SocialPost"("brandId");
CREATE INDEX IF NOT EXISTS "SocialPost_status_idx" ON "SocialPost"("status");

CREATE TABLE IF NOT EXISTS "SocialPostEstablishment" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"socialPostId" TEXT NOT NULL,"establishmentId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SocialPostEstablishment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "SocialPostEstablishment_socialPostId_establishmentId_key" ON "SocialPostEstablishment"("socialPostId","establishmentId");

CREATE TABLE IF NOT EXISTS "SocialPostVersion" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"socialPostId" TEXT NOT NULL,"versionNumber" INTEGER NOT NULL DEFAULT 1,"caption" TEXT,"hashtags" TEXT[],"platform" "SocialPlatform","format" "ContentFormat","origin" "PostVersionOrigin" NOT NULL DEFAULT 'AI',"aiPromptUsed" TEXT,"isActive" BOOLEAN NOT NULL DEFAULT true,"createdById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SocialPostVersion_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "SocialPostVersion_socialPostId_idx" ON "SocialPostVersion"("socialPostId");

CREATE TABLE IF NOT EXISTS "SocialPostMedia" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"socialPostId" TEXT NOT NULL,"mediaAssetId" TEXT NOT NULL,"mediaVariantId" TEXT,"role" "PostMediaRole" NOT NULL DEFAULT 'PRIMARY',"position" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SocialPostMedia_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "SocialPostMedia_socialPostId_mediaAssetId_role_key" ON "SocialPostMedia"("socialPostId","mediaAssetId","role");

-- Publication
CREATE TABLE IF NOT EXISTS "PublicationJob" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"socialPostId" TEXT NOT NULL,"socialAccountId" TEXT NOT NULL,"status" "PublicationJobStatus" NOT NULL DEFAULT 'PENDING',"scheduledAt" TIMESTAMP(3),"publishedAt" TIMESTAMP(3),"externalPostId" TEXT,"externalPostUrl" TEXT,"lastAttemptAt" TIMESTAMP(3),"nextRetryAt" TIMESTAMP(3),"retryCount" INTEGER NOT NULL DEFAULT 0,"errorMessage" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PublicationJob_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "PublicationJob_organizationId_idx" ON "PublicationJob"("organizationId");
CREATE INDEX IF NOT EXISTS "PublicationJob_socialPostId_idx" ON "PublicationJob"("socialPostId");
CREATE INDEX IF NOT EXISTS "PublicationJob_status_idx" ON "PublicationJob"("status");

CREATE TABLE IF NOT EXISTS "PublicationAttempt" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"publicationJobId" TEXT NOT NULL,"status" "PublicationAttemptStatus" NOT NULL DEFAULT 'STARTED',"errorMessage" TEXT,"responsePayload" JSONB,"attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3), CONSTRAINT "PublicationAttempt_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "PublicationAttempt_publicationJobId_idx" ON "PublicationAttempt"("publicationJobId");

-- Analytics
CREATE TABLE IF NOT EXISTS "AnalyticsSnapshot" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"brandId" TEXT,"establishmentId" TEXT,"socialAccountId" TEXT,"socialPostId" TEXT,"platform" "SocialPlatform","snapshotDate" DATE NOT NULL,"followers" INTEGER,"reach" INTEGER,"impressions" INTEGER,"likes" INTEGER,"comments" INTEGER,"shares" INTEGER,"saves" INTEGER,"clicks" INTEGER,"engagement" DOUBLE PRECISION,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "AnalyticsSnapshot_organizationId_idx" ON "AnalyticsSnapshot"("organizationId");
CREATE INDEX IF NOT EXISTS "AnalyticsSnapshot_snapshotDate_idx" ON "AnalyticsSnapshot"("snapshotDate");

-- Feedback & Audit
CREATE TABLE IF NOT EXISTS "UserFeedback" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"userId" TEXT,"socialPostId" TEXT,"contentIdeaId" TEXT,"mediaAssetId" TEXT,"target" "FeedbackTarget" NOT NULL,"rating" INTEGER,"reasons" "FeedbackReason"[],"comment" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "UserFeedback_organizationId_idx" ON "UserFeedback"("organizationId");

CREATE TABLE IF NOT EXISTS "AuditLog" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"actorUserId" TEXT,"action" "AuditAction" NOT NULL,"resourceType" TEXT NOT NULL,"resourceId" TEXT,"metadata" JSONB,"ipAddress" TEXT,"userAgent" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- Foreign Keys (session, account, org member, etc.)
DO $$ BEGIN ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "RestaurantBrand" ADD CONSTRAINT "RestaurantBrand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "WebsiteImport" ADD CONSTRAINT "WebsiteImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "WebsiteImport" ADD CONSTRAINT "WebsiteImport_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "WebsiteImport" ADD CONSTRAINT "WebsiteImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "WebsitePage" ADD CONSTRAINT "WebsitePage_importId_fkey" FOREIGN KEY ("importId") REFERENCES "WebsiteImport"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "MediaVariant" ADD CONSTRAINT "MediaVariant_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "MediaTag" ADD CONSTRAINT "MediaTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ContentCampaign" ADD CONSTRAINT "ContentCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SocialPostVersion" ADD CONSTRAINT "SocialPostVersion_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_publicationJobId_fkey" FOREIGN KEY ("publicationJobId") REFERENCES "PublicationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  console.log('[migrate] ✅ Migration complete! All tables created.');
  await client.end();
  process.exit(0);
} catch (err) {
  console.error('[migrate] ❌ Migration failed:', err.message);
  await client.end();
  process.exit(1);
}
