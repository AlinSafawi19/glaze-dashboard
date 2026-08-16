"use client";

import { useActionState, useState } from "react";

import { Loader } from "@/components/loader";
import { Button, CancelLink, Card, Field, INPUT_CLASS } from "@/components/ui";
import type { ResourceConfig } from "@/lib/resources";
import type { FormState } from "@/lib/actions/resources";

export type ResourceValues = Record<string, string | null>;

/**
 * Rich text is authored as HTML here, so the editor shows the markup and a live
 * preview side by side. The preview carries `.prose-glaze`, the same rules the
 * storefront renders these pages with, so what you see is what ships.
 */
function HtmlField({
  name,
  label,
  hint,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue: string;
}) {
  const [html, setHtml] = useState(defaultValue);

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint={hint}>
        <textarea
          name={name}
          placeholder={placeholder}
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          className={`${INPUT_CLASS} min-h-[320px] font-mono text-[12px] leading-relaxed`}
        />
      </Field>

      <div>
        <p className="mb-1.5 label-sm text-brown">Preview</p>
        <div className="max-h-[320px] overflow-y-auto border border-dashed border-beige bg-caledon p-5">
          {html.trim() ? (
            <div
              className="prose-glaze"
              // Author-only field, and the server sanitises it again on save.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="font-inter text-[14px] font-light italic text-brown">
              Nothing to preview yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResourceForm({
  config,
  action,
  values = {},
  submitLabel,
}: {
  config: ResourceConfig;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  values?: ResourceValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5 p-6">
        {config.fields.map((field) => {
          if (field.type === "richtext") {
            return (
              <HtmlField
                key={field.name}
                name={field.name}
                label={field.label}
                hint={field.hint}
                placeholder={field.placeholder}
                defaultValue={values[field.name] ?? ""}
              />
            );
          }

          const common = {
            id: field.name,
            name: field.name,
            placeholder: field.placeholder,
            maxLength: field.maxLength,
            required: field.required,
          };

          if (field.type === "textarea") {
            return (
              <Field key={field.name} label={field.label} hint={field.hint}>
                <textarea
                  {...common}
                  className={`${INPUT_CLASS} min-h-[140px]`}
                  defaultValue={values[field.name] ?? ""}
                />
              </Field>
            );
          }

          return (
            <Field key={field.name} label={field.label} hint={field.hint}>
              <input
                {...common}
                className={INPUT_CLASS}
                type={field.type === "url" ? "url" : "text"}
                defaultValue={values[field.name] ?? ""}
              />
            </Field>
          );
        })}

        {state.error && (
          <p className="bg-danger-soft px-3 py-2 font-inter text-[14px] font-light text-error">
            {state.error}
          </p>
        )}
      </Card>

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
        <CancelLink href={`/${config.key}`}>Cancel</CancelLink>
      </div>
    </form>
  );
}
