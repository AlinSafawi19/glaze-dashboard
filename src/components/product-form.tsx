"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Loader } from "@/components/loader";
import { BrandAsyncSelect } from "@/components/select";
import { Button, CancelLink, Card, Field, INPUT_CLASS } from "@/components/ui";
import type { FormState } from "@/lib/actions/resources";

export interface Option {
  id: string;
  title: string;
}

export interface ProductValues {
  title: string;
  coverImage: string;
  image2: string;
  image3: string;
  image4: string;
  price: string;
  discount: string;
  size: string;
  keyIngredients: string;
  description: string;
  isNewIn: boolean;
  isLimited: boolean;
  brandId: string;
  categoryId: string;
  collectionId: string;
  skinTypeIds: string[];
}

export const EMPTY_PRODUCT: ProductValues = {
  title: "",
  coverImage: "",
  image2: "",
  image3: "",
  image4: "",
  price: "0",
  discount: "0",
  size: "",
  keyIngredients: "",
  description: "",
  isNewIn: false,
  isLimited: false,
  brandId: "",
  categoryId: "",
  collectionId: "",
  skinTypeIds: [],
};

const IMAGE_FIELDS = [
  {
    name: "coverImage",
    label: "Cover image",
    hint: "The first image on the product page and the one used on every card.",
  },
  { name: "image2", label: "Image 2" },
  { name: "image3", label: "Image 3" },
  { name: "image4", label: "Image 4" },
] as const;

const toOptions = (list: Option[]) => list.map((o) => ({ value: o.id, label: o.title }));

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-clash text-xs font-medium uppercase tracking-wide text-muted">
      {children}
    </h2>
  );
}

function CheckboxRow({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        name={name}
        value="on"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-[var(--color-plum)]"
      />
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

/** Live thumbnail so a bad URL is obvious before saving. */
function ImageInput({
  name,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [broken, setBroken] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-line bg-paper">
        {url && !broken ? (
          <Image
            src={url}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="text-[10px] text-muted">{broken ? "broken" : "empty"}</span>
        )}
      </div>
      <Field label={label} hint={hint} className="flex-1">
        <input
          name={name}
          type="url"
          className={INPUT_CLASS}
          value={url}
          placeholder="https://…"
          onChange={(e) => {
            setUrl(e.target.value);
            setBroken(false);
          }}
        />
      </Field>
    </div>
  );
}

export function ProductForm({
  action,
  values,
  brands,
  categories,
  collections,
  skinTypes,
  knownSizes,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  values: ProductValues;
  brands: Option[];
  categories: Option[];
  collections: Option[];
  skinTypes: Option[];
  /** Sizes already in use, offered as suggestions on the free-text field. */
  knownSizes: string[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  const [price, setPrice] = useState(values.price);
  const [discount, setDiscount] = useState(values.discount);

  const priceNumber = Number.parseFloat(price) || 0;
  const discountNumber = Number.parseInt(discount, 10) || 0;
  const finalPrice =
    discountNumber > 0 ? Math.round(priceNumber * (1 - discountNumber / 100)) : priceNumber;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-5 p-6">
            <SectionHeading>Basics</SectionHeading>

            <Field
              label="Title"
              hint="The storefront link is made from this automatically the first time you save."
            >
              <input
                name="title"
                className={INPUT_CLASS}
                defaultValue={values.title}
                placeholder="Marble Mortar"
                required
                maxLength={200}
              />
            </Field>

            <Field label="Description">
              <textarea
                name="description"
                className={`${INPUT_CLASS} min-h-[110px]`}
                defaultValue={values.description}
                placeholder="Smooth, rich, essential. A tactile blend that nourishes deeply…"
              />
            </Field>

            <Field label="Key ingredients" hint="Comma separated, shown next to the size.">
              <input
                name="keyIngredients"
                className={INPUT_CLASS}
                defaultValue={values.keyIngredients}
                maxLength={500}
                placeholder="Rose, Vanilla, Sandalwood"
              />
            </Field>
          </Card>

          <Card className="flex flex-col gap-5 p-6">
            <SectionHeading>Images</SectionHeading>
            {IMAGE_FIELDS.map((field) => (
              <ImageInput
                key={field.name}
                name={field.name}
                label={field.label}
                hint={"hint" in field ? field.hint : undefined}
                defaultValue={values[field.name]}
              />
            ))}
          </Card>

          <Card className="flex flex-col gap-5 p-6">
            <SectionHeading>Details</SectionHeading>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Size" hint="Free text — start typing to reuse an existing one.">
                <input
                  name="size"
                  className={INPUT_CLASS}
                  defaultValue={values.size}
                  placeholder="125ml — 14.9% vol."
                  maxLength={120}
                  list="known-sizes"
                />
              </Field>
              <datalist id="known-sizes">
                {knownSizes.map((size) => (
                  <option key={size} value={size} />
                ))}
              </datalist>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-5 p-6">
            <SectionHeading>Price</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Price">
                <input
                  name="price"
                  className={INPUT_CLASS}
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </Field>
              <Field label="Discount %">
                <input
                  name="discount"
                  className={INPUT_CLASS}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </Field>
            </div>
            <p className="bg-accent-soft px-3 py-2 text-sm">
              Shoppers pay <strong className="font-semibold">${finalPrice}</strong>
              {discountNumber > 0 && (
                <span className="text-muted"> (was ${priceNumber})</span>
              )}
            </p>
          </Card>

          <Card className="flex flex-col gap-4 p-6">
            <SectionHeading>Badges</SectionHeading>
            <CheckboxRow
              name="isNewIn"
              label="New in"
              hint="For recent arrivals."
              defaultChecked={values.isNewIn}
            />
            <CheckboxRow
              name="isLimited"
              label="Limited"
              hint="For short runs and limited stock."
              defaultChecked={values.isLimited}
            />
            <p className="border-t border-line pt-3 text-xs text-muted">
              “Best seller” is not a checkbox — it is worked out from how much the product
              has actually sold, and takes precedence over these two.
            </p>
          </Card>

          <Card className="flex flex-col gap-5 p-6">
            <SectionHeading>Organisation</SectionHeading>

            {/* These lists come from the database, so they are searchable
                rather than a plain dropdown. */}
            <Field label="Brand">
              <BrandAsyncSelect
                name="brandId"
                options={toOptions(brands)}
                defaultValue={values.brandId}
                placeholder="Search brands…"
              />
            </Field>

            <Field label="Category">
              <BrandAsyncSelect
                name="categoryId"
                options={toOptions(categories)}
                defaultValue={values.categoryId}
                placeholder="Search categories…"
              />
            </Field>

            <Field label="Collection">
              <BrandAsyncSelect
                name="collectionId"
                options={toOptions(collections)}
                defaultValue={values.collectionId}
                placeholder="Search collections…"
              />
            </Field>

            <Field label="Skin types">
              {skinTypes.length === 0 ? (
                <p className="font-inter text-[14px] font-light italic text-brown">
                  None set up yet —{" "}
                  <Link href="/skin-types/new" className="underline">
                    add one
                  </Link>
                  .
                </p>
              ) : (
                <BrandAsyncSelect
                  name="skinTypeIds"
                  options={toOptions(skinTypes)}
                  defaultValue={values.skinTypeIds}
                  placeholder="Search skin types…"
                  isMulti
                />
              )}
            </Field>
          </Card>
        </div>
      </div>

      {state.error && (
        <p className="bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader size={14} />
              Saving…
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <CancelLink href="/products">Cancel</CancelLink>
      </div>
    </form>
  );
}
