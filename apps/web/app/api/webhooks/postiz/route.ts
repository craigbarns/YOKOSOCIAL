import { db } from "@yokosocial/database";
import { createHmac } from "crypto";
import { NextResponse } from "next/server";

const WEBHOOK_SECRET = process.env.POSTIZ_WEBHOOK_SECRET;

function verifySignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // Accept if secret not configured locally
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return signature === expected;
}

function mapPostizStatus(status: string): "SCHEDULED" | "PUBLISHED" | "FAILED" | "CANCELLED" {
  const s = status.toLowerCase();
  if (s === "pending" || s === "scheduled") return "SCHEDULED";
  if (s === "published") return "PUBLISHED";
  if (s === "failed" || s === "error") return "FAILED";
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  return "SCHEDULED";
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-postiz-signature");
  const body = await req.text();

  if (signature && !verifySignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; postId?: string; status?: string; publishedAt?: string };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[Webhook:Postiz]", event.type, event.postId);

  if (!event.postId) {
    return NextResponse.json({ received: true });
  }

  switch (event.type) {
    case "post.status_updated": {
      if (event.status) {
        await db.socialPost.updateMany({
          where: {
            publicationJobs: {
              some: {
                attempts: {
                  some: { externalId: event.postId }
                }
              }
            }
          },
          data: {
            status: mapPostizStatus(event.status),
            updatedAt: new Date()
          }
        });
      }
      break;
    }

    default:
      console.log("[Webhook:Postiz] Event received:", event.type);
  }

  return NextResponse.json({ received: true });
}
