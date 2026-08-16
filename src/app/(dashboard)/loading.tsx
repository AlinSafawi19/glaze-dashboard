import { LoaderScreen } from "@/components/loader";

/**
 * Shown while any dashboard route's data is in flight. Because it sits at the
 * route-group level it covers every page inside the sidebar shell, so the
 * navigation stays put and only the content area waits.
 */
export default function Loading() {
  return <LoaderScreen className="py-24" />;
}
