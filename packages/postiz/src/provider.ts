import type {
  AnalyticsMetric,
  AnalyticsWindow,
  GetPostStatusInput,
  ListIntegrationsOptions,
  ListPostsQuery,
  PostizIntegration,
  PostizListedPost,
  PostizNotificationsResponse,
  SchedulePostInput,
  UploadMediaInput,
  UploadedMediaReference
} from "./schemas.js";

export type PostizProviderMode = "mock" | "real";

export interface PostizConnectionStatus {
  connected: boolean;
  provider: "postiz";
  mode: PostizProviderMode;
}

export interface UploadedMedia extends UploadedMediaReference {
  name: string;
  size: number;
}

export interface ConfirmedScheduleResult {
  outcome: "SCHEDULED";
  remotePosts: ReadonlyArray<{
    remotePostId: string;
    integrationId: string;
  }>;
  scheduledAt: string;
}

export interface AmbiguousScheduleResult {
  outcome: "UNKNOWN_REMOTE_STATE";
  remotePosts: readonly [];
  retryAllowed: false;
  reason: string;
}

export type SchedulePostResult = ConfirmedScheduleResult | AmbiguousScheduleResult;

export interface ConfirmedCancellationResult {
  outcome: "CANCELLED";
  remotePostId: string;
  remoteState: "DRAFT";
}

export interface AmbiguousCancellationResult {
  outcome: "UNKNOWN_REMOTE_STATE";
  remotePostId: string;
  retryAllowed: false;
  reason: string;
}

export type CancelScheduledPostResult = ConfirmedCancellationResult | AmbiguousCancellationResult;

export type RemotePublicationStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELLED"
  | "UNKNOWN_REMOTE_STATE";

export interface RemotePostStatusResult {
  remotePostId: string;
  status: RemotePublicationStatus;
  certainty: "CONFIRMED" | "INFERRED" | "UNKNOWN";
  supportsAuthoritativeRemoteStatus: boolean;
  evidence?: "MOCK_STATE" | "RELEASE_URL" | "FUTURE_PUBLISH_DATE";
  post?: PostizListedPost;
  limitation?: string;
}

export interface SocialPublishingProvider {
  readonly provider: "postiz";
  readonly mode: PostizProviderMode;

  testConnection(): Promise<PostizConnectionStatus>;
  listIntegrations(options?: ListIntegrationsOptions): Promise<readonly PostizIntegration[]>;
  uploadMedia(input: UploadMediaInput): Promise<UploadedMedia>;
  schedulePost(input: SchedulePostInput): Promise<SchedulePostResult>;
  cancelScheduledPost(remotePostId: string): Promise<CancelScheduledPostResult>;
  listPosts(query: ListPostsQuery): Promise<readonly PostizListedPost[]>;
  getPostStatus(input: GetPostStatusInput): Promise<RemotePostStatusResult>;
  getIntegrationAnalytics(
    integrationId: string,
    days: AnalyticsWindow
  ): Promise<readonly AnalyticsMetric[]>;
  getPostAnalytics(
    remotePostId: string,
    days: AnalyticsWindow
  ): Promise<readonly AnalyticsMetric[]>;
  listNotifications(page?: number): Promise<PostizNotificationsResponse>;
}

export type PostizProvider = SocialPublishingProvider;
