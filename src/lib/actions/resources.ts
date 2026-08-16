"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sanitizeHtml from "sanitize-html";

import { requireOwner, requireUserForAction } from "@/lib/dal";
import { uniqueSlug } from "@/lib/slug";
import { taxonomyDelegate } from "@/lib/taxonomy-delegate";
import { RESOURCES, type ResourceKey } from "@/lib/resources";

export interface FormState {
  error?: string;
  ok?: boolean;
}

/** Shared with the CSV importer — see `taxonomy-delegate.ts` for the why. */
const delegate = taxonomyDelegate;

/** Editors paste from Word and from the old CMS; keep structure, drop payloads. */
function cleanHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [
      "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "b", "em", "i", "u", "s",
      "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      "*": ["dir"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}

/** Reads the configured fields out of a submitted form. */
function readFields(key: ResourceKey, formData: FormData) {
  const config = RESOURCES[key];
  const data: Record<string, string | null> = {};

  for (const field of config.fields) {
    const raw = String(formData.get(field.name) ?? "").trim();

    if (field.type === "richtext") {
      data[field.name] = cleanHtml(raw);
      continue;
    }

    if (field.required) {
      data[field.name] = raw;
      continue;
    }

    data[field.name] = raw === "" ? null : raw;
  }

  return { config, data };
}

function validate(key: ResourceKey, data: Record<string, string | null>): string | null {
  const config = RESOURCES[key];
  for (const field of config.fields) {
    const value = data[field.name];
    if (field.required && !value) return `${field.label} is required.`;
    if (field.maxLength && value && value.length > field.maxLength) {
      return `${field.label} must be ${field.maxLength} characters or fewer.`;
    }
    if (field.type === "url" && value && !/^https?:\/\//i.test(value)) {
      return `${field.label} must start with http:// or https://.`;
    }
  }
  return null;
}

function refresh(key: ResourceKey) {
  revalidatePath(`/${key}`);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

export async function createResource(
  key: ResourceKey,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  await requireUserForAction();
  const { config, data } = readFields(key, formData);

  const problem = validate(key, data);
  if (problem) return { error: problem };

  // New rows land at the end of the list.
  const last = await delegate(config.model).findFirst({
    orderBy: { sortIndex: "desc" },
    select: { sortIndex: true },
  });

  let id: string;
  try {
    const created = await delegate(config.model).create({
      data: {
        ...data,
        // Derived from the title, deduplicated, and fixed from here on.
        slug: await uniqueSlug(config.model, String(data.title ?? "")),
        sortIndex: (last?.sortIndex ?? -1) + 1,
      },
      select: { id: true },
    });
    id = created.id;
  } catch (error) {
    console.error(`[${key} create]`, error);
    return { error: "Could not save. Please try again." };
  }

  refresh(key);
  redirect(`/${key}`);
}

export async function updateResource(
  key: ResourceKey,
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  await requireUserForAction();
  const { config, data } = readFields(key, formData);

  const problem = validate(key, data);
  if (problem) return { error: problem };

  // The UI hides the edit link on an archived row and the edit page refuses to
  // render one, but neither is a control — a stale tab or a hand-made request
  // would still reach this action, so the rule is enforced here too.
  const existing = await delegate(config.model).findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!existing) return { error: "That item no longer exists." };
  if (existing.archivedAt) {
    return { error: "This is archived. Restore it before making changes." };
  }

  try {
    // `slug` is deliberately absent: it is set once at creation and never
    // follows a rename, so storefront links and saved carts keep working.
    await delegate(config.model).update({ where: { id }, data });
  } catch (error) {
    console.error(`[${key} update]`, error);
    return { error: "Could not save. Please try again." };
  }

  refresh(key);
  redirect(`/${key}`);
}

/** Soft delete: the row stops being served but stays recoverable. */
export async function archiveResource(key: ResourceKey, id: string): Promise<void> {
  await requireUserForAction();
  const config = RESOURCES[key];

  const row = await delegate(config.model).findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!row) throw new Error("That item no longer exists.");
  if (row.archivedAt) return; // already archived; nothing to do

  await delegate(config.model).update({ where: { id }, data: { archivedAt: new Date() } });
  refresh(key);
}

export async function restoreResource(key: ResourceKey, id: string): Promise<void> {
  await requireUserForAction();
  const config = RESOURCES[key];

  const row = await delegate(config.model).findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!row) throw new Error("That item no longer exists.");
  if (!row.archivedAt) return; // already live

  await delegate(config.model).update({ where: { id }, data: { archivedAt: null } });
  refresh(key);
}

/**
 * Permanent. Owners only, and only for something already archived — so it takes
 * two deliberate steps to lose data.
 */
export async function deleteResource(key: ResourceKey, id: string): Promise<void> {
  await requireOwner();
  const config = RESOURCES[key];

  const row = await delegate(config.model).findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!row?.archivedAt) throw new Error("Archive it first.");

  await delegate(config.model).delete({ where: { id } });
  refresh(key);
}
