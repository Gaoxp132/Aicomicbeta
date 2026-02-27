import * as React from "react";
import { cn } from "./utils";

const BASE = "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden";

const VARIANT: Record<string, string> = {
  default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
  secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
  destructive: "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
  outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
};

export function badgeVariants({ variant = "default", className }: {
  variant?: string; className?: string;
} = {}) {
  return cn(BASE, VARIANT[variant] || VARIANT.default, className);
}

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: string; asChild?: boolean }) {
  const { asChild, ...rest } = props as any;
  return (
    <span
      data-slot="badge"
      className={badgeVariants({ variant, className })}
      {...rest}
    />
  );
}

export { Badge };
