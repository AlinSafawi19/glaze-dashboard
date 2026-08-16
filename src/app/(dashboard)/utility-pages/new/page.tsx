import type { Metadata } from "next";

import { ResourceForm } from "@/components/resource-form";
import { PageHeader } from "@/components/ui";
import { createResource } from "@/lib/actions/resources";
import { RESOURCES } from "@/lib/resources";

const CONFIG = RESOURCES["utility-pages"];

export const metadata: Metadata = { title: `New ${CONFIG.label}` };

export default function Page() {
  return (
    <>
      <PageHeader
        title={`New ${CONFIG.label.toLowerCase()}`}
        subtitle={CONFIG.description}
      />
      <ResourceForm
        config={CONFIG}
        action={createResource.bind(null, CONFIG.key)}
        submitLabel={`Create ${CONFIG.label.toLowerCase()}`}
      />
    </>
  );
}
