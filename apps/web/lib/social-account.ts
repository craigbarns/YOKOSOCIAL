type SchedulableAccount = {
  status: string;
  remoteIntegrationId: string | null;
};

export function isProgrammableSocialAccount(account: SchedulableAccount): boolean {
  return account.status === "CONNECTED" && Boolean(account.remoteIntegrationId);
}
