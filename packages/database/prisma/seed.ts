import { PrismaPg } from "@prisma/adapter-pg";

import { loadDatabaseEnvironment } from "../scripts/load-environment";

import {
  BrandTone,
  ContentFormat,
  ContentIdeaStatus,
  ContentTopic,
  DataValidationStatus,
  EstablishmentStatus,
  ImportedDataType,
  MediaCategory,
  MediaEditorialCategory,
  MediaStatus,
  MenuItemStatus,
  OrganizationRole,
  PostAudienceScope,
  PostMediaRole,
  PostVersionOrigin,
  PrismaClient,
  PublicationJobStatus,
  SocialAccountStatus,
  SocialPlatform,
  SocialPostStatus,
  WebsiteImportMode,
  WebsiteImportStatus,
  WebsitePageStatus,
  WebsitePageType
} from "../src/generated/prisma/client";

loadDatabaseEnvironment();

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL ou DIRECT_URL est requis pour exécuter le seed.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const ids = {
  user: "demo_user_yokosocial",
  organization: "demo_org_yokosushi",
  member: "demo_member_owner",
  brand: "demo_brand_yokosushi",
  brandProfile: "demo_brand_profile_yokosushi",
  establishmentCentre: "demo_establishment_centre",
  establishmentRives: "demo_establishment_rives",
  import: "demo_website_import",
  importPage: "demo_website_import_page",
  categoryPlatters: "demo_category_platters",
  categoryPoke: "demo_category_poke",
  productDiscovery: "demo_product_discovery",
  productPoke: "demo_product_poke",
  instagramAccount: "demo_social_instagram",
  facebookAccount: "demo_social_facebook"
} as const;

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);

async function seedIdentityAndTenant(): Promise<void> {
  await prisma.user.upsert({
    where: { id: ids.user },
    update: {
      name: "[DÉMO] Responsable YokoSushi",
      emailVerified: true
    },
    create: {
      id: ids.user,
      name: "[DÉMO] Responsable YokoSushi",
      email: "demo@yokosocial.invalid",
      emailVerified: true
    }
  });

  await prisma.organization.upsert({
    where: { id: ids.organization },
    update: {
      name: "[DÉMO] YokoSushi",
      metadata: {
        demo: true,
        disclaimer: "Données fictives — aucune information issue du site réel."
      }
    },
    create: {
      id: ids.organization,
      name: "[DÉMO] YokoSushi",
      slug: "demo-yokosushi",
      metadata: {
        demo: true,
        disclaimer: "Données fictives — aucune information issue du site réel."
      }
    }
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: ids.organization,
        userId: ids.user
      }
    },
    update: { role: OrganizationRole.OWNER },
    create: {
      id: ids.member,
      organizationId: ids.organization,
      userId: ids.user,
      role: OrganizationRole.OWNER
    }
  });

  await prisma.restaurantBrand.upsert({
    where: { id: ids.brand },
    update: { name: "[DÉMO] YokoSushi", isDemo: true },
    create: {
      id: ids.brand,
      organizationId: ids.organization,
      name: "[DÉMO] YokoSushi",
      slug: "demo-yokosushi",
      websiteUrl: "https://www.yokosushi.fr",
      isDemo: true
    }
  });

  await prisma.brandProfile.upsert({
    where: { id: ids.brandProfile },
    update: {
      slogan: "[DÉMO] Des créations généreuses, préparées pour la démonstration."
    },
    create: {
      id: ids.brandProfile,
      organizationId: ids.organization,
      brandId: ids.brand,
      slogan: "[DÉMO] Des créations généreuses, préparées pour la démonstration.",
      story: "Profil entièrement fictif fourni pour tester le parcours sans Internet.",
      cuisineType: "Cuisine japonaise — démonstration",
      positioning: "Moderne, gourmand et local — démonstration",
      targetAudience: "Clients fictifs du mode démonstration",
      geographicArea: "Zone fictive",
      priceRange: "DÉMO — prix non contractuels",
      tones: [BrandTone.GOURMAND, BrandTone.WARM, BrandTone.MODERN],
      colors: { primary: "#8B1E2D", secondary: "#F5E9DC" },
      allowedExpressions: ["fraîcheur", "générosité", "préparé avec soin"],
      wordsToAvoid: ["explosion de saveurs", "expérience inoubliable"],
      allowedEmojis: ["🍣", "🥢", "✨"],
      emojiUsageLevel: 2,
      socialPlatforms: [SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK],
      customInstruction:
        "DÉMO : ton moderne, gourmand et direct. Ne jamais transformer ces exemples en informations réelles."
    }
  });
}

async function seedEstablishments(): Promise<void> {
  const establishments = [
    {
      id: ids.establishmentCentre,
      name: "[DÉMO] YokoSushi Centre",
      slug: "demo-centre",
      addressLine1: "Adresse fictive — établissement Centre",
      city: "Ville Démonstration",
      orderUrl: "https://demo.invalid/commande/centre"
    },
    {
      id: ids.establishmentRives,
      name: "[DÉMO] YokoSushi Rives",
      slug: "demo-rives",
      addressLine1: "Adresse fictive — établissement Rives",
      city: "Ville Démonstration",
      orderUrl: "https://demo.invalid/commande/rives"
    }
  ];

  for (const establishment of establishments) {
    await prisma.establishment.upsert({
      where: { id: establishment.id },
      update: {
        name: establishment.name,
        addressLine1: establishment.addressLine1,
        city: establishment.city,
        orderUrl: establishment.orderUrl
      },
      create: {
        ...establishment,
        organizationId: ids.organization,
        brandId: ids.brand,
        businessHours: {
          disclaimer: "Horaires fictifs du mode démonstration — à ne pas publier."
        },
        services: ["Service fictif — démonstration"],
        sourceUrl: `https://demo.invalid/etablissements/${establishment.slug}`,
        validationStatus: DataValidationStatus.APPROVED,
        status: EstablishmentStatus.ACTIVE,
        isDemo: true
      }
    });
  }
}

async function seedImportAndProducts(): Promise<void> {
  await prisma.websiteImport.upsert({
    where: { id: ids.import },
    update: { status: WebsiteImportStatus.COMPLETED, mode: WebsiteImportMode.DEMO },
    create: {
      id: ids.import,
      organizationId: ids.organization,
      brandId: ids.brand,
      createdById: ids.user,
      websiteUrl: "https://www.yokosushi.fr",
      mode: WebsiteImportMode.DEMO,
      status: WebsiteImportStatus.COMPLETED,
      startedAt: new Date(),
      completedAt: new Date(),
      pagesDetected: 1,
      pagesScanned: 1,
      productsDetected: 2,
      productsImported: 2,
      categoriesDetected: 2,
      imagesDetected: 5,
      imagesImported: 5,
      warningsCount: 1
    }
  });

  await prisma.websiteImportPage.upsert({
    where: { id: ids.importPage },
    update: { status: WebsitePageStatus.ANALYZED },
    create: {
      id: ids.importPage,
      organizationId: ids.organization,
      websiteImportId: ids.import,
      sourceUrl: "https://demo.invalid/import-simule",
      canonicalUrl: "https://demo.invalid/import-simule",
      pageType: WebsitePageType.MENU,
      status: WebsitePageStatus.ANALYZED,
      httpStatus: 200,
      fetchedAt: new Date(),
      analyzedAt: new Date(),
      metadata: { demo: true, disclaimer: "Page simulée, non récupérée sur yokosushi.fr." }
    }
  });

  const categories = [
    { id: ids.categoryPlatters, name: "[DÉMO] Plateaux", slug: "demo-plateaux" },
    { id: ids.categoryPoke, name: "[DÉMO] Pokés", slug: "demo-pokes" }
  ];

  for (const category of categories) {
    await prisma.productCategory.upsert({
      where: { id: category.id },
      update: { name: category.name },
      create: {
        ...category,
        organizationId: ids.organization,
        brandId: ids.brand,
        description: "Catégorie fictive du mode démonstration.",
        sourceUrl: `https://demo.invalid/carte/${category.slug}`,
        validationStatus: DataValidationStatus.APPROVED,
        isDemo: true
      }
    });
  }

  const products = [
    {
      id: ids.productDiscovery,
      categoryId: ids.categoryPlatters,
      name: "[DÉMO] Plateau Découverte",
      slug: "demo-plateau-decouverte",
      description: "Produit fictif créé uniquement pour tester la génération.",
      price: "24.90"
    },
    {
      id: ids.productPoke,
      categoryId: ids.categoryPoke,
      name: "[DÉMO] Poké Jardin",
      slug: "demo-poke-jardin",
      description: "Produit fictif créé uniquement pour tester la génération.",
      price: "14.50"
    }
  ];

  for (const product of products) {
    await prisma.menuItem.upsert({
      where: { id: product.id },
      update: { name: product.name, description: product.description },
      create: {
        ...product,
        organizationId: ids.organization,
        brandId: ids.brand,
        sourcePageId: ids.importPage,
        sourceUrl: `https://demo.invalid/produits/${product.slug}`,
        confidence: 1,
        validationStatus: DataValidationStatus.APPROVED,
        status: MenuItemStatus.ACTIVE,
        isDemo: true
      }
    });

    for (const establishmentId of [ids.establishmentCentre, ids.establishmentRives]) {
      await prisma.menuItemEstablishment.upsert({
        where: { menuItemId_establishmentId: { menuItemId: product.id, establishmentId } },
        update: { available: true },
        create: {
          organizationId: ids.organization,
          menuItemId: product.id,
          establishmentId,
          available: true,
          sourceUrl: `https://demo.invalid/disponibilite/${product.slug}`,
          validationStatus: DataValidationStatus.APPROVED
        }
      });
    }
  }

  await prisma.importedData.upsert({
    where: { id: "demo_imported_data_disclaimer" },
    update: { value: { demo: true, text: "Données fictives" } },
    create: {
      id: "demo_imported_data_disclaimer",
      organizationId: ids.organization,
      brandId: ids.brand,
      websiteImportId: ids.import,
      websiteImportPageId: ids.importPage,
      type: ImportedDataType.OTHER,
      key: "demo_disclaimer",
      value: { demo: true, text: "Données fictives — aucune donnée réelle importée." },
      normalizedValue: "Données fictives — aucune donnée réelle importée.",
      sourceUrl: "https://demo.invalid/import-simule",
      confidence: 1,
      validationStatus: DataValidationStatus.APPROVED
    }
  });
}

const mediaDefinitions = [
  {
    id: "demo_media_plateau",
    title: "[DÉMO] Plateau",
    file: "placeholder-plateau.svg",
    category: MediaCategory.PLATTER,
    editorialCategory: MediaEditorialCategory.PLATTER,
    productId: ids.productDiscovery,
    score: 88
  },
  {
    id: "demo_media_poke",
    title: "[DÉMO] Poké",
    file: "placeholder-poke.svg",
    category: MediaCategory.PRODUCT,
    editorialCategory: MediaEditorialCategory.POKE,
    productId: ids.productPoke,
    score: 84
  },
  {
    id: "demo_media_restaurant",
    title: "[DÉMO] Restaurant",
    file: "placeholder-restaurant.svg",
    category: MediaCategory.RESTAURANT,
    editorialCategory: MediaEditorialCategory.RESTAURANT,
    productId: null,
    score: 81
  },
  {
    id: "demo_media_delivery",
    title: "[DÉMO] Livraison",
    file: "placeholder-delivery.svg",
    category: MediaCategory.DELIVERY,
    editorialCategory: MediaEditorialCategory.DELIVERY,
    productId: null,
    score: 78
  },
  {
    id: "demo_media_team",
    title: "[DÉMO] Équipe",
    file: "placeholder-team.svg",
    category: MediaCategory.TEAM,
    editorialCategory: MediaEditorialCategory.TEAM,
    productId: null,
    score: 80
  }
] as const;

async function seedMedia(): Promise<void> {
  let index = 1;

  for (const media of mediaDefinitions) {
    const sha256 = index.toString(16).padStart(64, "0");
    const storageKey = `demo/media/${media.file}`;

    await prisma.mediaAsset.upsert({
      where: { id: media.id },
      update: { detectedTitle: media.title, qualityScore: media.score },
      create: {
        id: media.id,
        organizationId: ids.organization,
        brandId: ids.brand,
        websiteImportId: ids.import,
        websiteImportPageId: ids.importPage,
        menuItemId: media.productId,
        sourceUrl: `https://demo.invalid/media/${media.file}`,
        sourcePageUrl: "https://demo.invalid/import-simule",
        originalName: media.file,
        storageKey,
        storageProvider: "local",
        publicUrl: `/demo/media/${media.file}`,
        mimeType: "image/svg+xml",
        width: 1200,
        height: 1200,
        byteSize: BigInt(0),
        aspectRatio: 1,
        sha256,
        perceptualHash: index.toString(16).padStart(16, "0"),
        altText: `${media.title} — visuel fictif de démonstration`,
        detectedTitle: media.title,
        detectedDescription: "Placeholder local, sans origine externe.",
        category: media.category,
        editorialCategory: media.editorialCategory,
        qualityScore: media.score,
        instagramPotentialScore: media.score,
        facebookPotentialScore: media.score - 2,
        storyPotentialScore: media.score - 5,
        carouselPotentialScore: media.score - 3,
        reelPotentialScore: media.score - 8,
        status: MediaStatus.APPROVED,
        isDemo: true,
        metadata: { demo: true, placeholder: true }
      }
    });

    for (const establishmentId of [ids.establishmentCentre, ids.establishmentRives]) {
      await prisma.mediaAssetEstablishment.upsert({
        where: { mediaAssetId_establishmentId: { mediaAssetId: media.id, establishmentId } },
        update: { validated: true },
        create: {
          organizationId: ids.organization,
          mediaAssetId: media.id,
          establishmentId,
          confidence: 1,
          validated: true
        }
      });
    }

    index += 1;
  }
}

async function seedSocialAccounts(): Promise<void> {
  const accounts = [
    {
      id: ids.instagramAccount,
      platform: SocialPlatform.INSTAGRAM,
      displayName: "[DÉMO] Instagram YokoSushi",
      username: "demo_yokosushi",
      externalId: "mock-instagram-yokosushi"
    },
    {
      id: ids.facebookAccount,
      platform: SocialPlatform.FACEBOOK,
      displayName: "[DÉMO] Facebook YokoSushi",
      username: "demo.yokosushi",
      externalId: "mock-facebook-yokosushi"
    }
  ];

  for (const account of accounts) {
    await prisma.socialAccount.upsert({
      where: { id: account.id },
      update: { status: SocialAccountStatus.CONNECTED },
      create: {
        ...account,
        organizationId: ids.organization,
        brandId: ids.brand,
        provider: "postiz-mock",
        remoteIntegrationId: `integration-${account.externalId}`,
        status: SocialAccountStatus.CONNECTED,
        metadata: { demo: true, credentials: "Aucun secret — compte simulé." }
      }
    });
  }
}

async function seedGeneratedPosts(): Promise<void> {
  const now = new Date();
  const posts = [
    {
      number: 1,
      title: "[DÉMO] Le plateau à partager",
      objective: "Présenter un produit fictif du mode démonstration",
      topic: ContentTopic.PLATTER,
      format: ContentFormat.IMAGE,
      mediaAssetId: "demo_media_plateau",
      instagramCaption: "[DÉMO] Un plateau imaginé pour tester votre futur feed 🍣",
      facebookCaption:
        "[DÉMO] Voici un exemple fictif de publication produit. Vérifiez toujours la carte réelle avant validation.",
      callToAction: "Tester l’aperçu",
      hashtags: ["#DemoYokoSocial", "#ContenuFictif"],
      suggestedAt: addDays(now, 1),
      status: SocialPostStatus.DRAFT
    },
    {
      number: 2,
      title: "[DÉMO] Pause poké colorée",
      objective: "Tester une publication produit Instagram et Facebook",
      topic: ContentTopic.PRODUCT,
      format: ContentFormat.CAROUSEL,
      mediaAssetId: "demo_media_poke",
      instagramCaption: "[DÉMO] Des couleurs, du croquant et un exemple prêt à personnaliser 🥢",
      facebookCaption:
        "[DÉMO] Exemple fictif : personnalisez ce texte avec un produit réellement importé et validé.",
      callToAction: "Personnaliser la publication",
      hashtags: ["#DemoYokoSocial", "#PokeDemo"],
      suggestedAt: addDays(now, 2),
      status: SocialPostStatus.DRAFT
    },
    {
      number: 3,
      title: "[DÉMO] Dans les coulisses",
      objective: "Illustrer un contenu de marque sans inventer une information réelle",
      topic: ContentTopic.BEHIND_THE_SCENES,
      format: ContentFormat.STORY,
      mediaAssetId: "demo_media_team",
      instagramCaption: "[DÉMO] Un format Story fictif pour préparer vos prochains contenus.",
      facebookCaption:
        "[DÉMO] Aperçu fictif des coulisses, à remplacer par une information validée.",
      callToAction: "Voir les écrans de Story",
      hashtags: ["#DemoYokoSocial", "#CoulissesDemo"],
      suggestedAt: addDays(now, 3),
      status: SocialPostStatus.DRAFT
    },
    {
      number: 4,
      title: "[DÉMO] Une adresse à mettre en lumière",
      objective: "Tester une publication locale associée à un établissement fictif",
      topic: ContentTopic.LOCAL,
      format: ContentFormat.IMAGE,
      mediaAssetId: "demo_media_restaurant",
      instagramCaption:
        "[DÉMO] Exemple local : sélectionnez toujours le bon établissement avant validation.",
      facebookCaption:
        "[DÉMO] Publication locale fictive. Adresse, horaires et services doivent être vérifiés avant usage réel.",
      callToAction: "Vérifier l’établissement",
      hashtags: ["#DemoYokoSocial", "#RestaurantDemo"],
      suggestedAt: addDays(now, 4),
      status: SocialPostStatus.DRAFT
    },
    {
      number: 5,
      title: "[DÉMO] Commander en quelques gestes",
      objective: "Simuler une publication programmée avec Postiz mock",
      topic: ContentTopic.DELIVERY,
      format: ContentFormat.IMAGE,
      mediaAssetId: "demo_media_delivery",
      instagramCaption: "[DÉMO] Une idée fictive pour mettre en avant la commande ✨",
      facebookCaption:
        "[DÉMO] Simulation de publication orientée commande. Aucun lien réel n’est utilisé.",
      callToAction: "Simuler la programmation",
      hashtags: ["#DemoYokoSocial", "#LivraisonDemo"],
      suggestedAt: addDays(now, 5),
      status: SocialPostStatus.SCHEDULED
    }
  ];

  for (const post of posts) {
    const suffix = post.number.toString().padStart(2, "0");
    const ideaId = `demo_content_idea_${suffix}`;
    const postId = `demo_social_post_${suffix}`;
    const isScheduled = post.status === SocialPostStatus.SCHEDULED;

    await prisma.contentIdea.upsert({
      where: { id: ideaId },
      update: { title: post.title, suggestedAt: post.suggestedAt },
      create: {
        id: ideaId,
        organizationId: ids.organization,
        brandId: ids.brand,
        title: post.title,
        objective: post.objective,
        platforms: [SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK],
        format: post.format,
        topic: post.topic,
        status: ContentIdeaStatus.SELECTED,
        rationale: "Idée fictive générée par le ContentGenerationService mock.",
        warnings: [
          "Données de démonstration : vérifier toutes les informations avant publication."
        ],
        suggestedAt: post.suggestedAt,
        generatedBy: "mock",
        generationPayload: { demo: true },
        isDemo: true
      }
    });

    await prisma.socialPost.upsert({
      where: { id: postId },
      update: {
        title: post.title,
        instagramCaption: post.instagramCaption,
        facebookCaption: post.facebookCaption,
        status: post.status,
        scheduledAt: isScheduled ? post.suggestedAt : null
      },
      create: {
        id: postId,
        organizationId: ids.organization,
        brandId: ids.brand,
        contentIdeaId: ideaId,
        createdById: ids.user,
        approvedById: isScheduled ? ids.user : null,
        title: post.title,
        objective: post.objective,
        audienceScope: PostAudienceScope.SELECTED_ESTABLISHMENTS,
        platforms: [SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK],
        format: post.format,
        topic: post.topic,
        instagramCaption: post.instagramCaption,
        facebookCaption: post.facebookCaption,
        callToAction: post.callToAction,
        hashtags: post.hashtags,
        rationale: "Contenu fictif généré pour valider le parcours MVP.",
        warnings: ["DÉMO — ne pas publier comme une information réelle."],
        status: post.status,
        scheduledAt: isScheduled ? post.suggestedAt : null,
        approvedAt: isScheduled ? now : null,
        isDemo: true
      }
    });

    await prisma.socialPostEstablishment.upsert({
      where: {
        socialPostId_establishmentId: {
          socialPostId: postId,
          establishmentId: ids.establishmentCentre
        }
      },
      update: {},
      create: {
        organizationId: ids.organization,
        socialPostId: postId,
        establishmentId: ids.establishmentCentre
      }
    });

    await prisma.socialPostVersion.upsert({
      where: { socialPostId_versionNumber: { socialPostId: postId, versionNumber: 1 } },
      update: {},
      create: {
        organizationId: ids.organization,
        socialPostId: postId,
        createdById: ids.user,
        versionNumber: 1,
        origin: PostVersionOrigin.AI,
        content: {
          demo: true,
          instagramCaption: post.instagramCaption,
          facebookCaption: post.facebookCaption,
          hashtags: post.hashtags
        },
        internalNote: "Version initiale générée par le provider mock."
      }
    });

    await prisma.socialPostMedia.upsert({
      where: { socialPostId_sortOrder: { socialPostId: postId, sortOrder: 0 } },
      update: { mediaAssetId: post.mediaAssetId },
      create: {
        organizationId: ids.organization,
        socialPostId: postId,
        mediaAssetId: post.mediaAssetId,
        role: PostMediaRole.PRIMARY,
        sortOrder: 0
      }
    });
  }

  await prisma.publicationJob.upsert({
    where: { id: "demo_publication_job_05" },
    update: { status: PublicationJobStatus.SCHEDULED },
    create: {
      id: "demo_publication_job_05",
      organizationId: ids.organization,
      socialPostId: "demo_social_post_05",
      socialAccountId: ids.instagramAccount,
      provider: "postiz-mock",
      platform: SocialPlatform.INSTAGRAM,
      status: PublicationJobStatus.SCHEDULED,
      scheduledAt: addDays(now, 5),
      externalId: "mock-scheduled-publication-05",
      remoteStatus: "scheduled",
      idempotencyKey: "demo-social-post-05-instagram",
      sanitizedPayload: { demo: true, containsSecrets: false }
    }
  });
}

async function main(): Promise<void> {
  console.info("Insertion du jeu de données [DÉMO] — aucune donnée réelle de yokosushi.fr.");

  await seedIdentityAndTenant();
  await seedEstablishments();
  await seedImportAndProducts();
  await seedMedia();
  await seedSocialAccounts();
  await seedGeneratedPosts();

  console.info("Seed [DÉMO] terminé : 2 établissements, 2 produits et 5 publications fictives.");
}

main()
  .catch((error: unknown) => {
    console.error("Échec du seed [DÉMO].", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
