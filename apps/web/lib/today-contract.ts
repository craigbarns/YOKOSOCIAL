import type { NextAction, TodaySnapshot } from "@yokosocial/shared";
import { z } from "zod";

export const todayQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  brandId: z.string().trim().min(1)
});

export type TodayQuery = z.infer<typeof todayQuerySchema>;

export type TodayResponse = {
  snapshot: TodaySnapshot;
  action: NextAction;
};
