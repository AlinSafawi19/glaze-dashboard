import type { NextRequest } from "next/server";
import { z } from "zod";

import { bearerFrom, verifyApiKey } from "@/lib/api-key";
import { corsHeaders, json } from "@/lib/cors";
import { OWNER_EMAIL, sendEmail } from "@/lib/email/send";
import { contactMessage } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";
import { pushNotification } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const PROJECT = "glaze";

/**
 * The storefront's "Say hello" form.
 *
 * It lands as an email to the shop with the sender on Reply-To, and as a row in
 * the notification inbox so nothing is missed if the mail is filtered. Nothing
 * is stored beyond that notification — this is a message, not a record.
 */

const contactSchema = z.object({
  Name: z.string().trim().min(1, "Name is required.").max(160),
  Email: z.string().trim().toLowerCase().email("That email does not look right.").max(255),
  Phone: z.string().trim().max(60).optional(),
  Subject: z.string().trim().max(160).optional(),
  Message: z.string().trim().min(1, "Message is required.").max(4000),
  /**
   * A field no human sees. Anything that fills it in is a bot, and gets the
   * same cheerful answer as everyone else so it learns nothing.
   */
  Website: z.string().max(200).optional(),
});

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ project: string }> }
) {
  const { project } = await ctx.params;

  const raw = bearerFrom(request);
  if (!raw) return json(request, { error: "API key required" }, { status: 401 });
  if (!(await verifyApiKey(raw))) {
    return json(request, { error: "Invalid API key" }, { status: 401 });
  }
  if (project !== PROJECT) {
    return json(request, { error: "Project not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Body must be JSON" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      request,
      { error: "Invalid message", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const message = parsed.data;
  if (message.Website) return json(request, { data: { sent: true } }, { status: 202 });

  const detail = {
    name: message.Name,
    email: message.Email,
    phone: message.Phone ?? null,
    subject: message.Subject ?? null,
    message: message.Message,
  };

  // Neither of these may fail the form: someone took the trouble to write in,
  // and a mail provider having a bad minute is not their problem.
  const [sent] = await Promise.all([
    OWNER_EMAIL
      ? sendEmail(contactMessage(detail, OWNER_EMAIL))
      : Promise.resolve(false),
    recordNotification(detail),
  ]);

  if (!OWNER_EMAIL) {
    console.warn("[contact] STORE_EMAIL is not set; message only reached the inbox");
  }

  return json(request, { data: { sent } }, { status: 201 });
}

async function recordNotification(detail: {
  name: string;
  email: string;
  subject: string | null;
  message: string;
}): Promise<void> {
  try {
    const row = await prisma.notification.create({
      data: {
        type: "contact.message",
        title: detail.subject
          ? `Say hello — ${detail.subject}`
          : `${detail.name} said hello`,
        body: `${detail.email} · ${detail.message}`.slice(0, 500),
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    });

    pushNotification({ ...row, readAt: null, createdAt: row.createdAt.toISOString() });
  } catch (error) {
    console.error("[contact] could not record notification", error);
  }
}
