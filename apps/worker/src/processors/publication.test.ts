import { MockPostizProvider } from "@yokosocial/postiz";
import type { TenantJobPayload } from "@yokosocial/shared";
import { describe, expect, it, vi } from "vitest";

import {
  MockPublicationMediaLoader,
  PublicationMediaLoadError
} from "./publication-media-loader.js";
import {
  PublicationProcessingError,
  PublicationReconciliationProcessor,
  PublicationScheduleProcessor,
  type PublicationAttemptStartResult,
  type PublicationContext,
  type PublicationJobRepository,
  type PublicationPhase,
  type PublicationReconciliationPublisher,
  type RecordPublicationOutcomeInput
} from "./publication.js";

const now = new Date("2026-08-02T10:00:00.000Z");
const scheduledAt = new Date("2026-08-03T10:00:00.000Z");

const payload: TenantJobPayload = {
  organizationId: "org_1",
  actorId: "user_1",
  resourceId: "job_1",
  idempotencyKey: "publication-schedule-job-1"
};

function context(overrides: Partial<PublicationContext> = {}): PublicationContext {
  return {
    jobId: "job_1",
    organizationId: "org_1",
    socialPostId: "post_1",
    socialAccountId: "account_1",
    jobStatus: "PROCESSING",
    providerName: "postiz-mock",
    platform: "INSTAGRAM",
    scheduledAt,
    externalId: null,
    remoteStatus: null,
    attemptsCount: 1,
    idempotencyKey: "database-idempotency-key",
    post: {
      status: "SCHEDULED",
      format: "IMAGE",
      platforms: ["INSTAGRAM"],
      instagramCaption: "Une publication validée 🍣",
      facebookCaption: null,
      callToAction: "Commander",
      hashtags: ["#YokoSushi"],
      currentVersionNumber: 2,
      approvedAt: new Date("2026-08-02T09:30:00.000Z"),
      currentVersion: {
        id: "version_2",
        versionNumber: 2,
        createdAt: new Date("2026-08-02T09:00:00.000Z")
      }
    },
    account: {
      status: "CONNECTED",
      provider: "postiz",
      platform: "INSTAGRAM",
      remoteIntegrationId: "mock-instagram-yokosushi",
      providerIdentifier: "instagram"
    },
    establishments: [
      {
        id: "establishment_1",
        organizationId: "org_1",
        linkOrganizationId: "org_1",
        status: "ACTIVE",
        validationStatus: "APPROVED",
        updatedAt: new Date("2026-08-02T09:00:00.000Z"),
        linkedAt: new Date("2026-08-02T09:00:00.000Z")
      }
    ],
    media: [
      {
        id: "media_1",
        organizationId: "org_1",
        originalName: "sushi.jpg",
        storageProvider: "local",
        storageKey: "org_1/media.jpg",
        publicUrl: "/uploads/org_1/media.jpg",
        mimeType: "image/jpeg",
        byteSize: 4,
        status: "APPROVED"
      }
    ],
    ...overrides
  };
}

class RecordingRepository implements PublicationJobRepository {
  readonly outcomes: RecordPublicationOutcomeInput[] = [];
  startCalls = 0;

  constructor(private readonly startResult: PublicationAttemptStartResult) {}

  startAttempt(
    _payload: TenantJobPayload,
    _phase: PublicationPhase,
    _startedAt: Date
  ): Promise<PublicationAttemptStartResult> {
    this.startCalls += 1;
    return Promise.resolve(this.startResult);
  }

  recordOutcome(input: RecordPublicationOutcomeInput): Promise<void> {
    this.outcomes.push(input);
    return Promise.resolve();
  }
}

class FailingOutcomeRepository extends RecordingRepository {
  override recordOutcome(input: RecordPublicationOutcomeInput): Promise<void> {
    this.outcomes.push(input);
    return Promise.reject(new Error("PostgreSQL indisponible"));
  }
}

class RecordingPublisher implements PublicationReconciliationPublisher {
  readonly published: Array<{ payload: TenantJobPayload; runAt: Date }> = [];

  publish(publishedPayload: TenantJobPayload, runAt: Date): Promise<void> {
    this.published.push({ payload: publishedPayload, runAt });
    return Promise.resolve();
  }
}

function started(publicationContext = context()): PublicationAttemptStartResult {
  return { kind: "STARTED", context: publicationContext, attemptNumber: 1 };
}

describe("PublicationScheduleProcessor", () => {
  it("programme le média mock, journalise un payload sans contenu et prépare la réconciliation", async () => {
    const repository = new RecordingRepository(started());
    const publisher = new RecordingPublisher();
    const processor = new PublicationScheduleProcessor(
      repository,
      new MockPostizProvider({ now: () => now }),
      new MockPublicationMediaLoader(),
      publisher,
      () => now
    );

    const result = await processor.execute(payload);

    expect(result).toMatchObject({ jobId: "job_1", status: "SCHEDULED" });
    expect(result.externalId).toMatch(/^mock-post-[a-f0-9]{24}$/u);
    expect(repository.outcomes).toHaveLength(1);
    expect(repository.outcomes[0]).toMatchObject({
      attemptStatus: "SUCCEEDED",
      jobStatus: "SCHEDULED",
      externalId: result.externalId,
      remoteStatus: "MOCK_SCHEDULED_SUCCESS"
    });
    const serialized = JSON.stringify(repository.outcomes[0]);
    expect(serialized).not.toContain("Une publication validée");
    expect(serialized).not.toContain("Authorization");
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.payload.resourceId).toBe("job_1");
    expect(publisher.published[0]?.runAt.toISOString()).toBe("2026-08-03T10:01:00.000Z");
  });

  it("fige un résultat distant ambigu sans nouvelle tentative", async () => {
    const repository = new RecordingRepository(started());
    const publisher = new RecordingPublisher();
    const processor = new PublicationScheduleProcessor(
      repository,
      new MockPostizProvider({ scheduleScenarios: ["ambiguous"], now: () => now }),
      new MockPublicationMediaLoader(),
      publisher,
      () => now
    );

    await expect(processor.execute(payload)).resolves.toEqual({
      jobId: "job_1",
      status: "UNCERTAIN"
    });
    expect(repository.outcomes[0]).toMatchObject({
      attemptStatus: "UNCERTAIN",
      jobStatus: "UNCERTAIN",
      remoteStatus: "UNKNOWN_REMOTE_STATE"
    });
    expect(publisher.published).toHaveLength(0);
  });

  it("transforme une erreur Postiz non retentable en échec terminal", async () => {
    const repository = new RecordingRepository(started());
    const processor = new PublicationScheduleProcessor(
      repository,
      new MockPostizProvider({ scheduleScenarios: ["submission_error"], now: () => now }),
      new MockPublicationMediaLoader(),
      new RecordingPublisher(),
      () => now
    );

    const promise = processor.execute(payload);
    await expect(promise).rejects.toBeInstanceOf(PublicationProcessingError);
    await expect(promise).rejects.toMatchObject({ retryable: false, code: "VALIDATION_FAILED" });
    expect(repository.outcomes[0]).toMatchObject({
      attemptStatus: "FAILED",
      jobStatus: "FAILED",
      errorCode: "VALIDATION_FAILED"
    });
  });

  it("programme un backoff progressif pour une erreur média retentable", async () => {
    const repository = new RecordingRepository(started());
    const failingLoader = {
      load: () => Promise.reject(new PublicationMediaLoadError("NETWORK", true))
    };
    const processor = new PublicationScheduleProcessor(
      repository,
      new MockPostizProvider({ now: () => now }),
      failingLoader,
      new RecordingPublisher(),
      () => now
    );

    await expect(processor.execute(payload)).rejects.toMatchObject({
      retryable: true,
      retryAt: new Date("2026-08-02T10:00:05.000Z")
    });
    expect(repository.outcomes[0]).toMatchObject({
      attemptStatus: "RETRY_SCHEDULED",
      jobStatus: "PENDING",
      errorCode: "NETWORK"
    });
    expect(repository.outcomes[0]?.nextAttemptAt?.toISOString()).toBe("2026-08-02T10:00:05.000Z");
  });

  it("n'appelle aucun provider avant le retry différé", async () => {
    const retryAt = new Date("2026-08-02T10:07:00.000Z");
    const repository = new RecordingRepository({ kind: "DEFERRED", jobId: "job_1", retryAt });
    const provider = new MockPostizProvider({ now: () => now });
    const uploadSpy = vi.spyOn(provider, "uploadMedia");
    const scheduleSpy = vi.spyOn(provider, "schedulePost");
    const mediaLoader = { load: vi.fn() };
    const processor = new PublicationScheduleProcessor(
      repository,
      provider,
      mediaLoader,
      new RecordingPublisher(),
      () => now
    );

    await expect(processor.execute(payload)).rejects.toMatchObject({
      code: "PUBLICATION_ATTEMPT_DEFERRED",
      retryable: true,
      retryAt
    });
    expect(mediaLoader.load).not.toHaveBeenCalled();
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it("ne considère jamais ALREADY_RUNNING comme un traitement terminé", async () => {
    const repository = new RecordingRepository({ kind: "ALREADY_RUNNING", jobId: "job_1" });
    const provider = new MockPostizProvider({ now: () => now });
    const scheduleSpy = vi.spyOn(provider, "schedulePost");
    const processor = new PublicationScheduleProcessor(
      repository,
      provider,
      new MockPublicationMediaLoader(),
      new RecordingPublisher(),
      () => now
    );

    await expect(processor.execute(payload)).rejects.toMatchObject({
      code: "PUBLICATION_ATTEMPT_ALREADY_RUNNING",
      retryable: true,
      retryAt: new Date("2026-08-02T10:00:05.000Z")
    });
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it("ne reprogramme jamais après un UNKNOWN même si sa persistance échoue", async () => {
    const provider = new MockPostizProvider({ scheduleScenarios: ["ambiguous"], now: () => now });
    const scheduleSpy = vi.spyOn(provider, "schedulePost");
    const repository = new FailingOutcomeRepository(started());
    const firstProcessor = new PublicationScheduleProcessor(
      repository,
      provider,
      new MockPublicationMediaLoader(),
      new RecordingPublisher(),
      () => now
    );

    await expect(firstProcessor.execute(payload)).rejects.toMatchObject({
      code: "PUBLICATION_OUTCOME_PERSIST_FAILED",
      retryable: true,
      retryAt: new Date("2026-08-02T10:00:05.000Z")
    });
    expect(repository.outcomes).toHaveLength(1);
    expect(repository.outcomes[0]).toMatchObject({
      attemptStatus: "UNCERTAIN",
      jobStatus: "UNCERTAIN"
    });

    const leaseRetryAt = new Date("2026-08-02T10:00:30.000Z");
    const deferredRepository = new RecordingRepository({
      kind: "DEFERRED",
      jobId: "job_1",
      retryAt: leaseRetryAt
    });
    const retryProcessor = new PublicationScheduleProcessor(
      deferredRepository,
      provider,
      new MockPublicationMediaLoader(),
      new RecordingPublisher(),
      () => new Date("2026-08-02T10:00:05.000Z")
    );

    await expect(retryProcessor.execute(payload)).rejects.toMatchObject({
      code: "PUBLICATION_ATTEMPT_DEFERRED",
      retryAt: leaseRetryAt
    });
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it("rejette les médias d'un autre tenant avant tout upload", async () => {
    const invalidContext = context({
      media: context().media.map((media) => ({ ...media, organizationId: "org_2" }))
    });
    const repository = new RecordingRepository(started(invalidContext));
    const provider = new MockPostizProvider({ now: () => now });
    const uploadSpy = vi.spyOn(provider, "uploadMedia");
    const processor = new PublicationScheduleProcessor(
      repository,
      provider,
      new MockPublicationMediaLoader(),
      new RecordingPublisher(),
      () => now
    );

    await expect(processor.execute(payload)).rejects.toMatchObject({
      code: "POST_MEDIA_TENANT_MISMATCH",
      retryable: false
    });
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(repository.outcomes[0]).toMatchObject({ errorCode: "POST_MEDIA_TENANT_MISMATCH" });
  });

  it.each([
    {
      label: "inactif",
      establishment: { status: "INACTIVE" },
      code: "POST_ESTABLISHMENT_NOT_APPROVED"
    },
    {
      label: "modifié après approbation",
      establishment: { updatedAt: new Date("2026-08-02T09:31:00.000Z") },
      code: "POST_ESTABLISHMENT_CHANGED_AFTER_APPROVAL"
    },
    {
      label: "lié depuis un autre tenant",
      establishment: { linkOrganizationId: "org_2" },
      code: "POST_ESTABLISHMENT_TENANT_MISMATCH"
    }
  ])("revalide un établissement $label au moment de l'envoi", async ({ establishment, code }) => {
    const baseEstablishment = context().establishments[0]!;
    const invalidContext = context({
      establishments: [{ ...baseEstablishment, ...establishment }]
    });
    const repository = new RecordingRepository(started(invalidContext));
    const provider = new MockPostizProvider({ now: () => now });
    const uploadSpy = vi.spyOn(provider, "uploadMedia");
    const processor = new PublicationScheduleProcessor(
      repository,
      provider,
      new MockPublicationMediaLoader(),
      new RecordingPublisher(),
      () => now
    );

    await expect(processor.execute(payload)).rejects.toMatchObject({ code, retryable: false });
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("bloque un tenant non configuré en mode réel avant toute lecture PostgreSQL", async () => {
    const repository = new RecordingRepository(started());
    const provider = new MockPostizProvider({ now: () => now });
    Object.defineProperty(provider, "mode", { value: "real" });
    const processor = new PublicationScheduleProcessor(
      repository,
      provider,
      new MockPublicationMediaLoader(),
      new RecordingPublisher(),
      () => now,
      { realOrganizationId: "org_authorized" }
    );

    await expect(processor.execute(payload)).rejects.toMatchObject({
      code: "POSTIZ_TENANT_MISMATCH",
      retryable: false
    });
    expect(repository.startCalls).toBe(0);
  });
});

describe("PublicationReconciliationProcessor", () => {
  it("conserve le résultat mock déterministe après un redémarrage du provider", async () => {
    const scheduleRepository = new RecordingRepository(started());
    const scheduleProcessor = new PublicationScheduleProcessor(
      scheduleRepository,
      new MockPostizProvider({ scheduleScenarios: ["publication_error"], now: () => now }),
      new MockPublicationMediaLoader(),
      new RecordingPublisher(),
      () => now,
      { mockPublicationOutcome: "publication_error" }
    );
    const scheduled = await scheduleProcessor.execute(payload);
    const persistedSchedule = scheduleRepository.outcomes[0]!;
    expect(persistedSchedule.remoteStatus).toBe("MOCK_SCHEDULED_FAILURE");

    const clock = new Date("2026-08-03T10:02:00.000Z");
    const reconcileContext = context({
      externalId: scheduled.externalId ?? null,
      remoteStatus: persistedSchedule.remoteStatus ?? null,
      scheduledAt
    });
    const repository = new RecordingRepository(started(reconcileContext));
    const processor = new PublicationReconciliationProcessor(
      repository,
      new MockPostizProvider({ now: () => clock }),
      new RecordingPublisher(),
      () => clock
    );

    await expect(processor.execute(payload)).resolves.toEqual({
      jobId: "job_1",
      status: "FAILED"
    });
    expect(repository.outcomes[0]).toMatchObject({
      attemptStatus: "FAILED",
      jobStatus: "FAILED",
      remoteStatus: "FAILED",
      errorCode: "REMOTE_PUBLICATION_FAILED"
    });
  });

  it("classe UNKNOWN_REMOTE_STATE en UNCERTAIN sans le republier", async () => {
    const reconcileContext = context({ externalId: "remote-missing" });
    const repository = new RecordingRepository(started(reconcileContext));
    const publisher = new RecordingPublisher();
    const processor = new PublicationReconciliationProcessor(
      repository,
      new MockPostizProvider({ now: () => scheduledAt }),
      publisher,
      () => scheduledAt
    );

    await expect(processor.execute(payload)).resolves.toEqual({
      jobId: "job_1",
      status: "UNCERTAIN"
    });
    expect(repository.outcomes[0]).toMatchObject({
      attemptStatus: "UNCERTAIN",
      jobStatus: "UNCERTAIN"
    });
    expect(publisher.published).toHaveLength(0);
  });

  it("ne masque jamais une panne PostgreSQL pendant la réconciliation", async () => {
    const reconcileContext = context({ externalId: "remote-missing" });
    const repository = new FailingOutcomeRepository(started(reconcileContext));
    const processor = new PublicationReconciliationProcessor(
      repository,
      new MockPostizProvider({ now: () => scheduledAt }),
      new RecordingPublisher(),
      () => scheduledAt
    );

    await expect(processor.execute(payload)).rejects.toMatchObject({
      code: "PUBLICATION_OUTCOME_PERSIST_FAILED",
      retryable: true
    });
    expect(repository.outcomes).toHaveLength(1);
  });
});
