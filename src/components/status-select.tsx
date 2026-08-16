"use client";

import { useTransition } from "react";
import type { OrderStatus } from "@prisma/client";

import { Loader } from "@/components/loader";
import { BrandSelect } from "@/components/select";
import { setOrderStatus } from "@/lib/actions/orders";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";

const OPTIONS = ORDER_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }));

export function StatusSelect({ id, status }: { id: string; status: OrderStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <div className="w-[150px]">
        <BrandSelect
          name={`status-${id}`}
          options={OPTIONS}
          defaultValue={status}
          placeholder="Set status"
          isClearable={false}
          onChange={(next) => {
            if (!next || next === status) return;
            startTransition(() => {
              void setOrderStatus(id, next as OrderStatus);
            });
          }}
        />
      </div>
      {pending && <Loader size={16} label="Saving status" />}
    </div>
  );
}
