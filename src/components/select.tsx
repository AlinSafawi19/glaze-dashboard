"use client";

import { useEffect, useId, useState } from "react";
import Select, { type StylesConfig } from "react-select";
import AsyncSelect from "react-select/async";

import type { OptionSource } from "@/lib/options";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * react-select styled to the storefront: square corners, beige borders that go
 * black on focus, Inter at 14px, and the blush/dusty pair for menu states.
 *
 * Everything is driven through `styles` rather than class names because
 * react-select renders into its own emotion-scoped tree.
 */
const BRAND_STYLES: StylesConfig<SelectOption, boolean> = {
  control: (base, state) => ({
    ...base,
    minHeight: 40,
    borderRadius: 0,
    backgroundColor: "var(--color-white)",
    borderColor: state.isFocused ? "var(--color-black)" : "var(--color-beige)",
    boxShadow: "none",
    transition: "border-color 0.3s cubic-bezier(0.44, 0, 0.56, 1)",
    ":hover": { borderColor: state.isFocused ? "var(--color-black)" : "var(--color-brown)" },
  }),
  valueContainer: (base) => ({ ...base, padding: "2px 10px" }),
  input: (base) => ({ ...base, margin: 0, padding: 0, color: "var(--color-black)" }),
  placeholder: (base) => ({ ...base, color: "color-mix(in srgb, var(--color-brown) 50%, transparent)" }),
  singleValue: (base) => ({ ...base, color: "var(--color-black)" }),
  indicatorSeparator: (base) => ({ ...base, backgroundColor: "var(--color-beige)" }),
  dropdownIndicator: (base) => ({
    ...base,
    color: "var(--color-brown)",
    ":hover": { color: "var(--color-black)" },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--color-brown)",
    ":hover": { color: "var(--color-error)" },
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 0,
    marginTop: 4,
    border: "1px solid var(--color-beige)",
    boxShadow: "none",
    zIndex: 30,
  }),
  menuList: (base) => ({ ...base, paddingTop: 0, paddingBottom: 0 }),
  option: (base, state) => ({
    ...base,
    cursor: "pointer",
    color: "var(--color-black)",
    backgroundColor: state.isSelected
      ? "var(--color-blush)"
      : state.isFocused
        ? "var(--color-dusty)"
        : "var(--color-white)",
    ":active": { backgroundColor: "var(--color-blush)" },
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 0,
    backgroundColor: "var(--color-dusty)",
  }),
  multiValueLabel: (base) => ({ ...base, color: "var(--color-brown)" }),
  multiValueRemove: (base) => ({
    ...base,
    borderRadius: 0,
    color: "var(--color-brown)",
    ":hover": { backgroundColor: "var(--color-error)", color: "var(--color-white)" },
  }),
  // The menu is portalled out to <body>, so it needs to sit above the header
  // and any modal it is opened inside of.
  menuPortal: (base) => ({ ...base, zIndex: 60 }),
  noOptionsMessage: (base) => ({ ...base, color: "var(--color-brown)", fontStyle: "italic" }),
  loadingMessage: (base) => ({ ...base, color: "var(--color-brown)", fontStyle: "italic" }),
};

const BASE_PROPS = {
  styles: BRAND_STYLES,
  className: "font-inter text-[14px] font-light",
  menuPlacement: "auto" as const,
  /**
   * The menu is rendered into <body> rather than beside the control. A select
   * that sits in a table cell would otherwise have its menu cut off by the
   * table's own horizontal scroll container — which is exactly where the order
   * status select lives.
   */
  menuPortalTarget: typeof document === "undefined" ? undefined : document.body,
  menuPosition: "fixed" as const,
};

/**
 * react-select renders different markup on the server and after hydration,
 * which React flags. Holding render until mounted keeps the two in step; the
 * plain input rendered first also means the field still submits without JS.
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** A fixed option list known at build time — genders, statuses, and the like. */
export function BrandSelect({
  name,
  options,
  defaultValue,
  placeholder = "Select…",
  isClearable = true,
  required,
  onChange,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  isClearable?: boolean;
  required?: boolean;
  /** Fires on every change — for selects that act rather than submit. */
  onChange?: (value: string | null) => void;
}) {
  const instanceId = useId();
  const mounted = useMounted();
  const [value, setValue] = useState<SelectOption | null>(
    options.find((o) => o.value === defaultValue) ?? null
  );

  if (!mounted) {
    return (
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        onChange={(event) => onChange?.(event.target.value || null)}
        className="h-10 w-full rounded-none border border-beige bg-white px-3 font-inter text-[14px] font-light"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      <input type="hidden" name={name} value={value?.value ?? ""} />
      <Select<SelectOption>
        {...BASE_PROPS}
        instanceId={instanceId}
        inputId={`${instanceId}-input`}
        options={options}
        value={value}
        onChange={(option) => {
          setValue(option);
          onChange?.(option?.value ?? null);
        }}
        placeholder={placeholder}
        isClearable={isClearable}
        aria-label={placeholder}
      />
    </>
  );
}

/**
 * Options that live in the database.
 *
 * With a `source` the list is fetched from `/api/options` as the reader types,
 * so a shop with two thousand products never ships its whole brand list to the
 * browser on the off-chance the menu is opened. `options` is still used for the
 * first paint and for the no-JS fallback, and it is what the current value's
 * label is read from — including a value that is archived and so no longer
 * offered as a choice.
 *
 * Without a `source` it falls back to filtering `options` in the browser, which
 * is right for a list that is genuinely short and already loaded.
 */
export function BrandAsyncSelect({
  name,
  options,
  source,
  defaultValue,
  placeholder = "Search…",
  isMulti = false,
  isClearable = true,
  onChange,
}: {
  name: string;
  options: SelectOption[];
  /** Look choices up in the database instead of filtering `options` here. */
  source?: OptionSource;
  /** A single value, or a list of them when `isMulti`. */
  defaultValue?: string | string[];
  placeholder?: string;
  isMulti?: boolean;
  isClearable?: boolean;
  /** Fires on every change — for selects that act rather than submit. */
  onChange?: (value: string | null) => void;
}) {
  const instanceId = useId();
  const mounted = useMounted();

  const initial = Array.isArray(defaultValue)
    ? options.filter((o) => defaultValue.includes(o.value))
    : (options.find((o) => o.value === defaultValue) ?? null);

  const [value, setValue] = useState<SelectOption | readonly SelectOption[] | null>(initial);

  const loadOptions = async (input: string): Promise<SelectOption[]> => {
    if (!source) {
      return input
        ? options.filter((o) => o.label.toLowerCase().includes(input.toLowerCase()))
        : options;
    }

    try {
      const response = await fetch(
        `/api/options?source=${source}&q=${encodeURIComponent(input)}`
      );
      if (!response.ok) return [];
      const payload = (await response.json()) as { options?: SelectOption[] };
      return payload.options ?? [];
    } catch {
      // A dropped request should leave an empty menu, not an unhandled reject.
      return [];
    }
  };

  const selected = Array.isArray(value) ? value : value ? [value as SelectOption] : [];

  if (!mounted) {
    return (
      <select
        name={name}
        multiple={isMulti}
        onChange={(event) => onChange?.(event.target.value || null)}
        defaultValue={
          isMulti
            ? (Array.isArray(defaultValue) ? defaultValue : [])
            : ((defaultValue as string) ?? "")
        }
        className="min-h-10 w-full rounded-none border border-beige bg-white px-3 font-inter text-[14px] font-light"
      >
        {!isMulti && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      {/* One hidden input per selection keeps `formData.getAll(name)` working. */}
      {isMulti ? (
        selected.map((o) => <input key={o.value} type="hidden" name={name} value={o.value} />)
      ) : (
        <input type="hidden" name={name} value={selected[0]?.value ?? ""} />
      )}
      <AsyncSelect<SelectOption, boolean>
        {...BASE_PROPS}
        instanceId={instanceId}
        inputId={`${instanceId}-input`}
        cacheOptions={!source}
        // `true` is what tells react-select to call `loadOptions("")` itself and
        // fill the menu before anything is typed. An array instead *is* the
        // whole pre-typing menu — fine for a form handed the full list up
        // front, but a filter passes only its own current selection, so the
        // menu opened empty and read "Nothing matches" until you guessed a
        // letter that narrowed something you could not see.
        defaultOptions={source ? true : options}
        loadOptions={loadOptions}
        value={value}
        onChange={(next) => {
          setValue(next as SelectOption | readonly SelectOption[] | null);
          onChange?.((next as SelectOption | null)?.value ?? null);
        }}
        placeholder={placeholder}
        isMulti={isMulti}
        isClearable={isClearable}
        aria-label={placeholder}
        noOptionsMessage={() => "Nothing matches"}
      />
    </>
  );
}
