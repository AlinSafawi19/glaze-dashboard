import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResourceForm } from "@/components/resource-form";
import { PageHeader } from "@/components/ui";
import { updateResource } from "@/lib/actions/resources";
import { loadResource } from "@/lib/resource-queries";
import { RESOURCES } from "@/lib/resources";

const CONFIG = RESOURCES["categories"];

export const metadata: Metadata = { title: `Edit ${CONFIG.label}` };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const values = await loadResource(CONFIG, id);
  if (!values) notFound();

  return (
    <>
      <PageHeader title={values.title} subtitle={`Editing a ${CONFIG.label.toLowerCase()}`} />
      <ResourceForm
        config={CONFIG}
        action={updateResource.bind(null, CONFIG.key, id)}
        values={values}
        submitLabel="Save changes"
      />
    </>
  );
}
