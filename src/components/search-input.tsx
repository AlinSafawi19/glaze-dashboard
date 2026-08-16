"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Loader } from "@/components/loader";

/**
 * Filters as you type — no submit button. Keystrokes are debounced so a search
 * is one request per pause rather than one per character, and the URL is
 * replaced rather than pushed so the back button does not walk through every
 * partial query.
 */
export function SearchInput({
  paramName = "q",
  placeholder,
  debounceMs = 300,
}: {
  paramName?: string;
  placeholder: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const initial = searchParams.get(paramName) ?? "";
  const [value, setValue] = useState(initial);

  // Keep in step when the query changes from elsewhere (a cleared filter, a
  // browser navigation) without fighting what is being typed.
  const typed = useRef(initial);
  useEffect(() => {
    if (initial !== typed.current) {
      typed.current = initial;
      setValue(initial);
    }
  }, [initial]);

  useEffect(() => {
    if (value === initial) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value) params.set(paramName, value);
      else params.delete(paramName);

      typed.current = value;
      startTransition(() => {
        router.replace(`${pathname}?${params}`, { scroll: false });
      });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, initial, debounceMs, paramName, pathname, router, searchParams]);

  return (
    <div className="relative w-64">
      <Search
        size={15}
        strokeWidth={1.5}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brown"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-none border border-beige bg-white py-2 pl-9 pr-9 font-inter text-[14px] font-light text-black placeholder:text-brown/50 focus:border-black focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
        {pending ? (
          <Loader size={14} label="Searching" />
        ) : (
          value && (
            <button
              type="button"
              onClick={() => setValue("")}
              aria-label="Clear search"
              className="cursor-pointer text-brown transition-colors hover:text-black"
            >
              <X size={15} strokeWidth={1.5} />
            </button>
          )
        )}
      </span>
    </div>
  );
}
