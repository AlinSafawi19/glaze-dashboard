import type { Metadata } from "next";

import { ResourceListPage } from "@/components/resource-list";
import { RESOURCES } from "@/lib/resources";

const CONFIG = RESOURCES["collections"];

export const metadata: Metadata = { title: CONFIG.plural };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; q?: string; page?: string; show?: string }>;
}) {
  return <ResourceListPage config={CONFIG} searchParams={searchParams} />;
}
