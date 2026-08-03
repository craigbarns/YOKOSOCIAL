-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "EstablishmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'NEEDS_REVIEW', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "WebsiteImportMode" AS ENUM ('REAL', 'MOCK', 'DEMO');

-- CreateEnum
CREATE TYPE "WebsiteImportStatus" AS ENUM ('PENDING', 'CRAWLING', 'ANALYZING', 'WAITING_FOR_REVIEW', 'IMPORTING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebsitePageStatus" AS ENUM ('DISCOVERED', 'FETCHING', 'FETCHED', 'ANALYZED', 'PARTIAL', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebsitePageType" AS ENUM ('HOME', 'MENU', 'CATEGORY', 'PRODUCT', 'ESTABLISHMENT', 'CONTACT', 'ORDER', 'PROMOTION', 'SITEMAP', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportedDataType" AS ENUM ('BRAND', 'LOGO', 'BRAND_TEXT', 'ESTABLISHMENT', 'ADDRESS', 'PHONE', 'BUSINESS_HOURS', 'SERVICE', 'ORDER_LINK', 'RESERVATION_LINK', 'SOCIAL_LINK', 'PRODUCT_CATEGORY', 'PRODUCT', 'PRICE', 'ALLERGEN', 'PROMOTION', 'OTHER');

-- CreateEnum
CREATE TYPE "DataValidationStatus" AS ENUM ('UNREVIEWED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'SOURCE_NOT_FOUND');

-- CreateEnum
CREATE TYPE "MediaCategory" AS ENUM ('LOGO', 'PRODUCT', 'PLATTER', 'RESTAURANT', 'AMBIANCE', 'TEAM', 'DELIVERY', 'PROMOTION', 'DECORATION', 'TECHNICAL', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "MediaEditorialCategory" AS ENUM ('SUSHI', 'MAKI', 'CALIFORNIA', 'SASHIMI', 'NIGIRI', 'POKE', 'PLATTER', 'MENU', 'DESSERT', 'DRINK', 'RESTAURANT', 'TERRACE', 'AMBIANCE', 'TEAM', 'DELIVERY', 'LOGO', 'PROMOTION', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('APPROVED', 'NEEDS_REVIEW', 'LOW_QUALITY', 'REJECTED', 'ARCHIVED', 'SOURCE_NOT_FOUND');

-- CreateEnum
CREATE TYPE "MediaVariantKind" AS ENUM ('CROP', 'RESIZE', 'ENHANCED', 'INSTAGRAM_FEED', 'INSTAGRAM_STORY', 'FACEBOOK_FEED', 'THUMBNAIL');

-- CreateEnum
CREATE TYPE "MediaTagOrigin" AS ENUM ('IMPORTED', 'AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "MenuItemStatus" AS ENUM ('DRAFT', 'ACTIVE', 'UNAVAILABLE', 'NEEDS_REVIEW', 'ARCHIVED', 'SOURCE_NOT_FOUND');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'EXPIRED', 'REJECTED', 'ARCHIVED', 'SOURCE_NOT_FOUND');

-- CreateEnum
CREATE TYPE "BrandTone" AS ENUM ('PREMIUM', 'GOURMAND', 'WARM', 'TRENDY', 'FAMILY', 'MODERN', 'DYNAMIC', 'HUMOROUS', 'SOBER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('IMAGE', 'CAROUSEL', 'STORY', 'REEL');

-- CreateEnum
CREATE TYPE "ContentTopic" AS ENUM ('PRODUCT', 'PLATTER', 'RESTAURANT', 'AMBIANCE', 'PROMOTION', 'DELIVERY', 'BEHIND_THE_SCENES', 'TEAM', 'SEASONAL', 'LOCAL');

-- CreateEnum
CREATE TYPE "ContentIdeaStatus" AS ENUM ('DRAFT', 'SELECTED', 'USED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PostAudienceScope" AS ENUM ('BRAND', 'SELECTED_ESTABLISHMENTS');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'REJECTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PostVersionOrigin" AS ENUM ('AI', 'MANUAL', 'REGENERATION', 'DUPLICATION');

-- CreateEnum
CREATE TYPE "PostMediaRole" AS ENUM ('PRIMARY', 'CAROUSEL_SLIDE', 'STORY_FRAME', 'REEL_REFERENCE');

-- CreateEnum
CREATE TYPE "PublicationJobStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "PublicationAttemptStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'RETRY_SCHEDULED', 'UNCERTAIN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeedbackTarget" AS ENUM ('SOCIAL_POST', 'CONTENT_IDEA', 'MEDIA_ASSET', 'IMPORT', 'GENERAL');

-- CreateEnum
CREATE TYPE "FeedbackReason" AS ENUM ('TEXT_TOO_LONG', 'TEXT_TOO_GENERIC', 'WRONG_PHOTO', 'WRONG_PRODUCT', 'WRONG_INFORMATION', 'WRONG_DATE', 'WRONG_TONE', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'APPROVE', 'REJECT', 'SCHEDULE', 'CANCEL', 'PUBLISH', 'LOGIN', 'LOGOUT', 'EXPORT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantBrand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "websiteUrl" VARCHAR(2048),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Establishment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'FR',
    "phone" TEXT,
    "businessHours" JSONB,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orderUrl" VARCHAR(2048),
    "reservationUrl" VARCHAR(2048),
    "instagramUrl" VARCHAR(2048),
    "facebookUrl" VARCHAR(2048),
    "sourceUrl" VARCHAR(2048),
    "validationStatus" "DataValidationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "status" "EstablishmentStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "logoMediaAssetId" TEXT,
    "slogan" TEXT,
    "story" TEXT,
    "cuisineType" TEXT,
    "positioning" TEXT,
    "targetAudience" TEXT,
    "geographicArea" TEXT,
    "priceRange" TEXT,
    "tones" "BrandTone"[] DEFAULT ARRAY[]::"BrandTone"[],
    "colors" JSONB,
    "typography" JSONB,
    "allowedExpressions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wordsToAvoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedEmojis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emojiUsageLevel" INTEGER NOT NULL DEFAULT 1,
    "languages" TEXT[] DEFAULT ARRAY['fr']::TEXT[],
    "orderLinks" JSONB,
    "socialPlatforms" "SocialPlatform"[] DEFAULT ARRAY[]::"SocialPlatform"[],
    "customInstruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "establishmentId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'postiz',
    "platform" "SocialPlatform" NOT NULL,
    "displayName" TEXT NOT NULL,
    "username" TEXT,
    "externalId" TEXT,
    "remoteIntegrationId" TEXT,
    "credentialsEncrypted" TEXT,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdById" TEXT,
    "websiteUrl" VARCHAR(2048) NOT NULL,
    "mode" "WebsiteImportMode" NOT NULL DEFAULT 'REAL',
    "status" "WebsiteImportStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pagesDetected" INTEGER NOT NULL DEFAULT 0,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "productsDetected" INTEGER NOT NULL DEFAULT 0,
    "productsImported" INTEGER NOT NULL DEFAULT 0,
    "categoriesDetected" INTEGER NOT NULL DEFAULT 0,
    "imagesDetected" INTEGER NOT NULL DEFAULT 0,
    "imagesImported" INTEGER NOT NULL DEFAULT 0,
    "duplicatesDetected" INTEGER NOT NULL DEFAULT 0,
    "imagesTooSmall" INTEGER NOT NULL DEFAULT 0,
    "warningsCount" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteImportPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteImportId" TEXT NOT NULL,
    "establishmentId" TEXT,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "canonicalUrl" VARCHAR(2048),
    "pageType" "WebsitePageType" NOT NULL DEFAULT 'OTHER',
    "status" "WebsitePageStatus" NOT NULL DEFAULT 'DISCOVERED',
    "httpStatus" INTEGER,
    "contentHash" VARCHAR(64),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3),
    "analyzedAt" TIMESTAMP(3),
    "sourceLastModifiedAt" TIMESTAMP(3),
    "lastChangeDetectedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "internalError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteImportPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedData" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "establishmentId" TEXT,
    "websiteImportId" TEXT NOT NULL,
    "websiteImportPageId" TEXT,
    "type" "ImportedDataType" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "normalizedValue" TEXT,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validationStatus" "DataValidationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceLastModifiedAt" TIMESTAMP(3),
    "lastChangeDetectedAt" TIMESTAMP(3),
    "fingerprint" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "websiteImportId" TEXT,
    "websiteImportPageId" TEXT,
    "menuItemId" TEXT,
    "duplicateOfId" TEXT,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "sourcePageUrl" VARCHAR(2048) NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageBucket" TEXT,
    "publicUrl" VARCHAR(2048),
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "byteSize" BIGINT,
    "aspectRatio" DOUBLE PRECISION,
    "sha256" VARCHAR(64),
    "perceptualHash" VARCHAR(64),
    "altText" TEXT,
    "detectedTitle" TEXT,
    "detectedDescription" TEXT,
    "category" "MediaCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "editorialCategory" "MediaEditorialCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "instagramPotentialScore" INTEGER NOT NULL DEFAULT 0,
    "facebookPotentialScore" INTEGER NOT NULL DEFAULT 0,
    "storyPotentialScore" INTEGER NOT NULL DEFAULT 0,
    "carouselPotentialScore" INTEGER NOT NULL DEFAULT 0,
    "reelPotentialScore" INTEGER NOT NULL DEFAULT 0,
    "status" "MediaStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceLastModifiedAt" TIMESTAMP(3),
    "lastChangeDetectedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "sourceNotFoundAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaVariant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "kind" "MediaVariantKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" VARCHAR(2048),
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" BIGINT,
    "sha256" VARCHAR(64),
    "cropData" JSONB,
    "processingData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "origin" "MediaTagOrigin" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAssetTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "mediaTagId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAssetTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAssetEstablishment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAssetEstablishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" VARCHAR(2048),
    "validationStatus" "DataValidationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "categoryId" TEXT,
    "sourcePageId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "options" JSONB,
    "sourceUrl" VARCHAR(2048),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validationStatus" "DataValidationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "status" "MenuItemStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "sourceLastModifiedAt" TIMESTAMP(3),
    "lastChangeDetectedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemEstablishment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "localPrice" DECIMAL(10,2),
    "orderUrl" VARCHAR(2048),
    "sourceUrl" VARCHAR(2048),
    "validationStatus" "DataValidationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemEstablishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "offerDetails" TEXT,
    "terms" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sourceUrl" VARCHAR(2048),
    "validationStatus" "DataValidationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "sourceLastModifiedAt" TIMESTAMP(3),
    "lastChangeDetectedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionEstablishment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionEstablishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "brief" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCampaignEstablishment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentCampaignId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentCampaignEstablishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentIdea" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "contentCampaignId" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "platforms" "SocialPlatform"[],
    "format" "ContentFormat" NOT NULL,
    "topic" "ContentTopic" NOT NULL,
    "status" "ContentIdeaStatus" NOT NULL DEFAULT 'DRAFT',
    "rationale" TEXT NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedAt" TIMESTAMP(3),
    "repetitionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "generatedBy" TEXT NOT NULL DEFAULT 'mock',
    "generationPayload" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentIdeaEstablishment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentIdeaId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentIdeaEstablishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "contentCampaignId" TEXT,
    "contentIdeaId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "audienceScope" "PostAudienceScope" NOT NULL DEFAULT 'BRAND',
    "platforms" "SocialPlatform"[],
    "format" "ContentFormat" NOT NULL,
    "topic" "ContentTopic" NOT NULL,
    "instagramCaption" TEXT,
    "facebookCaption" TEXT,
    "callToAction" TEXT NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reelScript" TEXT,
    "storyFrames" JSONB,
    "carouselSlides" JSONB,
    "rationale" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "repetitionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" "FeedbackReason",
    "rejectionNote" TEXT,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostEstablishment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostEstablishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "createdById" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "origin" "PostVersionOrigin" NOT NULL,
    "content" JSONB NOT NULL,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostMedia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "mediaVariantId" TEXT,
    "role" "PostMediaRole" NOT NULL DEFAULT 'PRIMARY',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "headline" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'postiz',
    "platform" "SocialPlatform" NOT NULL,
    "status" "PublicationJobStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "remoteStatus" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sanitizedPayload" JSONB,
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "uncertainSince" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publicationJobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PublicationAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "sanitizedPayload" JSONB,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sanitizedResponse" JSONB,
    "externalId" TEXT,
    "remoteStatusCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "establishmentId" TEXT,
    "socialPostId" TEXT,
    "socialAccountId" TEXT,
    "provider" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "impressions" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "clicks" INTEGER,
    "videoViews" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "socialPostId" TEXT,
    "contentIdeaId" TEXT,
    "mediaAssetId" TEXT,
    "target" "FeedbackTarget" NOT NULL,
    "reason" "FeedbackReason",
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "Session"("createdAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_createdAt_idx" ON "Account"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Verification_createdAt_idx" ON "Verification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_createdAt_idx" ON "Organization"("createdAt");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_idx" ON "OrganizationMember"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_createdAt_idx" ON "OrganizationMember"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "RestaurantBrand_organizationId_idx" ON "RestaurantBrand"("organizationId");

-- CreateIndex
CREATE INDEX "RestaurantBrand_websiteUrl_idx" ON "RestaurantBrand"("websiteUrl");

-- CreateIndex
CREATE INDEX "RestaurantBrand_createdAt_idx" ON "RestaurantBrand"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantBrand_organizationId_slug_key" ON "RestaurantBrand"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Establishment_organizationId_idx" ON "Establishment"("organizationId");

-- CreateIndex
CREATE INDEX "Establishment_brandId_idx" ON "Establishment"("brandId");

-- CreateIndex
CREATE INDEX "Establishment_status_idx" ON "Establishment"("status");

-- CreateIndex
CREATE INDEX "Establishment_sourceUrl_idx" ON "Establishment"("sourceUrl");

-- CreateIndex
CREATE INDEX "Establishment_createdAt_idx" ON "Establishment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Establishment_brandId_slug_key" ON "Establishment"("brandId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "BrandProfile_brandId_key" ON "BrandProfile"("brandId");

-- CreateIndex
CREATE INDEX "BrandProfile_organizationId_idx" ON "BrandProfile"("organizationId");

-- CreateIndex
CREATE INDEX "BrandProfile_createdAt_idx" ON "BrandProfile"("createdAt");

-- CreateIndex
CREATE INDEX "SocialAccount_organizationId_idx" ON "SocialAccount"("organizationId");

-- CreateIndex
CREATE INDEX "SocialAccount_establishmentId_idx" ON "SocialAccount"("establishmentId");

-- CreateIndex
CREATE INDEX "SocialAccount_externalId_idx" ON "SocialAccount"("externalId");

-- CreateIndex
CREATE INDEX "SocialAccount_status_idx" ON "SocialAccount"("status");

-- CreateIndex
CREATE INDEX "SocialAccount_createdAt_idx" ON "SocialAccount"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_organizationId_provider_externalId_key" ON "SocialAccount"("organizationId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "WebsiteImport_organizationId_idx" ON "WebsiteImport"("organizationId");

-- CreateIndex
CREATE INDEX "WebsiteImport_status_idx" ON "WebsiteImport"("status");

-- CreateIndex
CREATE INDEX "WebsiteImport_websiteUrl_idx" ON "WebsiteImport"("websiteUrl");

-- CreateIndex
CREATE INDEX "WebsiteImport_createdAt_idx" ON "WebsiteImport"("createdAt");

-- CreateIndex
CREATE INDEX "WebsiteImportPage_organizationId_idx" ON "WebsiteImportPage"("organizationId");

-- CreateIndex
CREATE INDEX "WebsiteImportPage_establishmentId_idx" ON "WebsiteImportPage"("establishmentId");

-- CreateIndex
CREATE INDEX "WebsiteImportPage_status_idx" ON "WebsiteImportPage"("status");

-- CreateIndex
CREATE INDEX "WebsiteImportPage_sourceUrl_idx" ON "WebsiteImportPage"("sourceUrl");

-- CreateIndex
CREATE INDEX "WebsiteImportPage_createdAt_idx" ON "WebsiteImportPage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteImportPage_websiteImportId_sourceUrl_key" ON "WebsiteImportPage"("websiteImportId", "sourceUrl");

-- CreateIndex
CREATE INDEX "ImportedData_organizationId_idx" ON "ImportedData"("organizationId");

-- CreateIndex
CREATE INDEX "ImportedData_establishmentId_idx" ON "ImportedData"("establishmentId");

-- CreateIndex
CREATE INDEX "ImportedData_validationStatus_idx" ON "ImportedData"("validationStatus");

-- CreateIndex
CREATE INDEX "ImportedData_sourceUrl_idx" ON "ImportedData"("sourceUrl");

-- CreateIndex
CREATE INDEX "ImportedData_createdAt_idx" ON "ImportedData"("createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_idx" ON "MediaAsset"("organizationId");

-- CreateIndex
CREATE INDEX "MediaAsset_menuItemId_idx" ON "MediaAsset"("menuItemId");

-- CreateIndex
CREATE INDEX "MediaAsset_status_idx" ON "MediaAsset"("status");

-- CreateIndex
CREATE INDEX "MediaAsset_category_idx" ON "MediaAsset"("category");

-- CreateIndex
CREATE INDEX "MediaAsset_qualityScore_idx" ON "MediaAsset"("qualityScore");

-- CreateIndex
CREATE INDEX "MediaAsset_sourceUrl_idx" ON "MediaAsset"("sourceUrl");

-- CreateIndex
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "MediaAsset_perceptualHash_idx" ON "MediaAsset"("perceptualHash");

-- CreateIndex
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_organizationId_sha256_key" ON "MediaAsset"("organizationId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_organizationId_storageKey_key" ON "MediaAsset"("organizationId", "storageKey");

-- CreateIndex
CREATE INDEX "MediaVariant_organizationId_idx" ON "MediaVariant"("organizationId");

-- CreateIndex
CREATE INDEX "MediaVariant_mediaAssetId_idx" ON "MediaVariant"("mediaAssetId");

-- CreateIndex
CREATE INDEX "MediaVariant_sha256_idx" ON "MediaVariant"("sha256");

-- CreateIndex
CREATE INDEX "MediaVariant_createdAt_idx" ON "MediaVariant"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaVariant_organizationId_storageKey_key" ON "MediaVariant"("organizationId", "storageKey");

-- CreateIndex
CREATE INDEX "MediaTag_organizationId_idx" ON "MediaTag"("organizationId");

-- CreateIndex
CREATE INDEX "MediaTag_createdAt_idx" ON "MediaTag"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaTag_organizationId_slug_key" ON "MediaTag"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "MediaAssetTag_organizationId_idx" ON "MediaAssetTag"("organizationId");

-- CreateIndex
CREATE INDEX "MediaAssetTag_mediaTagId_idx" ON "MediaAssetTag"("mediaTagId");

-- CreateIndex
CREATE INDEX "MediaAssetTag_createdAt_idx" ON "MediaAssetTag"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAssetTag_mediaAssetId_mediaTagId_key" ON "MediaAssetTag"("mediaAssetId", "mediaTagId");

-- CreateIndex
CREATE INDEX "MediaAssetEstablishment_organizationId_idx" ON "MediaAssetEstablishment"("organizationId");

-- CreateIndex
CREATE INDEX "MediaAssetEstablishment_establishmentId_idx" ON "MediaAssetEstablishment"("establishmentId");

-- CreateIndex
CREATE INDEX "MediaAssetEstablishment_createdAt_idx" ON "MediaAssetEstablishment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAssetEstablishment_mediaAssetId_establishmentId_key" ON "MediaAssetEstablishment"("mediaAssetId", "establishmentId");

-- CreateIndex
CREATE INDEX "ProductCategory_organizationId_idx" ON "ProductCategory"("organizationId");

-- CreateIndex
CREATE INDEX "ProductCategory_sourceUrl_idx" ON "ProductCategory"("sourceUrl");

-- CreateIndex
CREATE INDEX "ProductCategory_createdAt_idx" ON "ProductCategory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_brandId_slug_key" ON "ProductCategory"("brandId", "slug");

-- CreateIndex
CREATE INDEX "MenuItem_organizationId_idx" ON "MenuItem"("organizationId");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "MenuItem_status_idx" ON "MenuItem"("status");

-- CreateIndex
CREATE INDEX "MenuItem_sourceUrl_idx" ON "MenuItem"("sourceUrl");

-- CreateIndex
CREATE INDEX "MenuItem_createdAt_idx" ON "MenuItem"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_brandId_slug_key" ON "MenuItem"("brandId", "slug");

-- CreateIndex
CREATE INDEX "MenuItemEstablishment_organizationId_idx" ON "MenuItemEstablishment"("organizationId");

-- CreateIndex
CREATE INDEX "MenuItemEstablishment_establishmentId_idx" ON "MenuItemEstablishment"("establishmentId");

-- CreateIndex
CREATE INDEX "MenuItemEstablishment_sourceUrl_idx" ON "MenuItemEstablishment"("sourceUrl");

-- CreateIndex
CREATE INDEX "MenuItemEstablishment_createdAt_idx" ON "MenuItemEstablishment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemEstablishment_menuItemId_establishmentId_key" ON "MenuItemEstablishment"("menuItemId", "establishmentId");

-- CreateIndex
CREATE INDEX "Promotion_organizationId_idx" ON "Promotion"("organizationId");

-- CreateIndex
CREATE INDEX "Promotion_status_idx" ON "Promotion"("status");

-- CreateIndex
CREATE INDEX "Promotion_sourceUrl_idx" ON "Promotion"("sourceUrl");

-- CreateIndex
CREATE INDEX "Promotion_createdAt_idx" ON "Promotion"("createdAt");

-- CreateIndex
CREATE INDEX "PromotionEstablishment_organizationId_idx" ON "PromotionEstablishment"("organizationId");

-- CreateIndex
CREATE INDEX "PromotionEstablishment_establishmentId_idx" ON "PromotionEstablishment"("establishmentId");

-- CreateIndex
CREATE INDEX "PromotionEstablishment_createdAt_idx" ON "PromotionEstablishment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionEstablishment_promotionId_establishmentId_key" ON "PromotionEstablishment"("promotionId", "establishmentId");

-- CreateIndex
CREATE INDEX "ContentCampaign_organizationId_idx" ON "ContentCampaign"("organizationId");

-- CreateIndex
CREATE INDEX "ContentCampaign_status_idx" ON "ContentCampaign"("status");

-- CreateIndex
CREATE INDEX "ContentCampaign_createdAt_idx" ON "ContentCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "ContentCampaignEstablishment_organizationId_idx" ON "ContentCampaignEstablishment"("organizationId");

-- CreateIndex
CREATE INDEX "ContentCampaignEstablishment_establishmentId_idx" ON "ContentCampaignEstablishment"("establishmentId");

-- CreateIndex
CREATE INDEX "ContentCampaignEstablishment_createdAt_idx" ON "ContentCampaignEstablishment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCampaignEstablishment_contentCampaignId_establishmen_key" ON "ContentCampaignEstablishment"("contentCampaignId", "establishmentId");

-- CreateIndex
CREATE INDEX "ContentIdea_organizationId_idx" ON "ContentIdea"("organizationId");

-- CreateIndex
CREATE INDEX "ContentIdea_status_idx" ON "ContentIdea"("status");

-- CreateIndex
CREATE INDEX "ContentIdea_suggestedAt_idx" ON "ContentIdea"("suggestedAt");

-- CreateIndex
CREATE INDEX "ContentIdea_createdAt_idx" ON "ContentIdea"("createdAt");

-- CreateIndex
CREATE INDEX "ContentIdeaEstablishment_organizationId_idx" ON "ContentIdeaEstablishment"("organizationId");

-- CreateIndex
CREATE INDEX "ContentIdeaEstablishment_establishmentId_idx" ON "ContentIdeaEstablishment"("establishmentId");

-- CreateIndex
CREATE INDEX "ContentIdeaEstablishment_createdAt_idx" ON "ContentIdeaEstablishment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentIdeaEstablishment_contentIdeaId_establishmentId_key" ON "ContentIdeaEstablishment"("contentIdeaId", "establishmentId");

-- CreateIndex
CREATE INDEX "SocialPost_organizationId_idx" ON "SocialPost"("organizationId");

-- CreateIndex
CREATE INDEX "SocialPost_status_idx" ON "SocialPost"("status");

-- CreateIndex
CREATE INDEX "SocialPost_scheduledAt_idx" ON "SocialPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "SocialPost_createdAt_idx" ON "SocialPost"("createdAt");

-- CreateIndex
CREATE INDEX "SocialPostEstablishment_organizationId_idx" ON "SocialPostEstablishment"("organizationId");

-- CreateIndex
CREATE INDEX "SocialPostEstablishment_establishmentId_idx" ON "SocialPostEstablishment"("establishmentId");

-- CreateIndex
CREATE INDEX "SocialPostEstablishment_createdAt_idx" ON "SocialPostEstablishment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostEstablishment_socialPostId_establishmentId_key" ON "SocialPostEstablishment"("socialPostId", "establishmentId");

-- CreateIndex
CREATE INDEX "SocialPostVersion_organizationId_idx" ON "SocialPostVersion"("organizationId");

-- CreateIndex
CREATE INDEX "SocialPostVersion_createdAt_idx" ON "SocialPostVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostVersion_socialPostId_versionNumber_key" ON "SocialPostVersion"("socialPostId", "versionNumber");

-- CreateIndex
CREATE INDEX "SocialPostMedia_organizationId_idx" ON "SocialPostMedia"("organizationId");

-- CreateIndex
CREATE INDEX "SocialPostMedia_mediaAssetId_idx" ON "SocialPostMedia"("mediaAssetId");

-- CreateIndex
CREATE INDEX "SocialPostMedia_createdAt_idx" ON "SocialPostMedia"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostMedia_socialPostId_sortOrder_key" ON "SocialPostMedia"("socialPostId", "sortOrder");

-- CreateIndex
CREATE INDEX "PublicationJob_organizationId_idx" ON "PublicationJob"("organizationId");

-- CreateIndex
CREATE INDEX "PublicationJob_status_idx" ON "PublicationJob"("status");

-- CreateIndex
CREATE INDEX "PublicationJob_scheduledAt_idx" ON "PublicationJob"("scheduledAt");

-- CreateIndex
CREATE INDEX "PublicationJob_externalId_idx" ON "PublicationJob"("externalId");

-- CreateIndex
CREATE INDEX "PublicationJob_createdAt_idx" ON "PublicationJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationJob_organizationId_provider_idempotencyKey_key" ON "PublicationJob"("organizationId", "provider", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PublicationAttempt_organizationId_idx" ON "PublicationAttempt"("organizationId");

-- CreateIndex
CREATE INDEX "PublicationAttempt_status_idx" ON "PublicationAttempt"("status");

-- CreateIndex
CREATE INDEX "PublicationAttempt_externalId_idx" ON "PublicationAttempt"("externalId");

-- CreateIndex
CREATE INDEX "PublicationAttempt_createdAt_idx" ON "PublicationAttempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationAttempt_publicationJobId_attemptNumber_key" ON "PublicationAttempt"("publicationJobId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_organizationId_idx" ON "AnalyticsSnapshot"("organizationId");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_establishmentId_idx" ON "AnalyticsSnapshot"("establishmentId");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_externalId_idx" ON "AnalyticsSnapshot"("externalId");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_capturedAt_idx" ON "AnalyticsSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_createdAt_idx" ON "AnalyticsSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "UserFeedback_organizationId_idx" ON "UserFeedback"("organizationId");

-- CreateIndex
CREATE INDEX "UserFeedback_socialPostId_idx" ON "UserFeedback"("socialPostId");

-- CreateIndex
CREATE INDEX "UserFeedback_createdAt_idx" ON "UserFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantBrand" ADD CONSTRAINT "RestaurantBrand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_logoMediaAssetId_fkey" FOREIGN KEY ("logoMediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteImport" ADD CONSTRAINT "WebsiteImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteImport" ADD CONSTRAINT "WebsiteImport_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteImport" ADD CONSTRAINT "WebsiteImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteImportPage" ADD CONSTRAINT "WebsiteImportPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteImportPage" ADD CONSTRAINT "WebsiteImportPage_websiteImportId_fkey" FOREIGN KEY ("websiteImportId") REFERENCES "WebsiteImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteImportPage" ADD CONSTRAINT "WebsiteImportPage_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedData" ADD CONSTRAINT "ImportedData_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedData" ADD CONSTRAINT "ImportedData_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedData" ADD CONSTRAINT "ImportedData_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedData" ADD CONSTRAINT "ImportedData_websiteImportId_fkey" FOREIGN KEY ("websiteImportId") REFERENCES "WebsiteImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedData" ADD CONSTRAINT "ImportedData_websiteImportPageId_fkey" FOREIGN KEY ("websiteImportPageId") REFERENCES "WebsiteImportPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_websiteImportId_fkey" FOREIGN KEY ("websiteImportId") REFERENCES "WebsiteImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_websiteImportPageId_fkey" FOREIGN KEY ("websiteImportPageId") REFERENCES "WebsiteImportPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaVariant" ADD CONSTRAINT "MediaVariant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaVariant" ADD CONSTRAINT "MediaVariant_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaTag" ADD CONSTRAINT "MediaTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetTag" ADD CONSTRAINT "MediaAssetTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetTag" ADD CONSTRAINT "MediaAssetTag_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetTag" ADD CONSTRAINT "MediaAssetTag_mediaTagId_fkey" FOREIGN KEY ("mediaTagId") REFERENCES "MediaTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetEstablishment" ADD CONSTRAINT "MediaAssetEstablishment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetEstablishment" ADD CONSTRAINT "MediaAssetEstablishment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetEstablishment" ADD CONSTRAINT "MediaAssetEstablishment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "WebsiteImportPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemEstablishment" ADD CONSTRAINT "MenuItemEstablishment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemEstablishment" ADD CONSTRAINT "MenuItemEstablishment_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemEstablishment" ADD CONSTRAINT "MenuItemEstablishment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionEstablishment" ADD CONSTRAINT "PromotionEstablishment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionEstablishment" ADD CONSTRAINT "PromotionEstablishment_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionEstablishment" ADD CONSTRAINT "PromotionEstablishment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCampaign" ADD CONSTRAINT "ContentCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCampaign" ADD CONSTRAINT "ContentCampaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCampaignEstablishment" ADD CONSTRAINT "ContentCampaignEstablishment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCampaignEstablishment" ADD CONSTRAINT "ContentCampaignEstablishment_contentCampaignId_fkey" FOREIGN KEY ("contentCampaignId") REFERENCES "ContentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCampaignEstablishment" ADD CONSTRAINT "ContentCampaignEstablishment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_contentCampaignId_fkey" FOREIGN KEY ("contentCampaignId") REFERENCES "ContentCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdeaEstablishment" ADD CONSTRAINT "ContentIdeaEstablishment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdeaEstablishment" ADD CONSTRAINT "ContentIdeaEstablishment_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdeaEstablishment" ADD CONSTRAINT "ContentIdeaEstablishment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_contentCampaignId_fkey" FOREIGN KEY ("contentCampaignId") REFERENCES "ContentCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostEstablishment" ADD CONSTRAINT "SocialPostEstablishment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostEstablishment" ADD CONSTRAINT "SocialPostEstablishment_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostEstablishment" ADD CONSTRAINT "SocialPostEstablishment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostVersion" ADD CONSTRAINT "SocialPostVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostVersion" ADD CONSTRAINT "SocialPostVersion_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostVersion" ADD CONSTRAINT "SocialPostVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_mediaVariantId_fkey" FOREIGN KEY ("mediaVariantId") REFERENCES "MediaVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_publicationJobId_fkey" FOREIGN KEY ("publicationJobId") REFERENCES "PublicationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "RestaurantBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
