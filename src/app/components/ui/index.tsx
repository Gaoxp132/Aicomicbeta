/**
 * UI Components — merged into single module to reduce Rollup graph nodes
 * v6.0.68: Merged utils.ts, button.tsx, badge.tsx, alert.tsx, input.tsx, textarea.tsx, card.tsx, sonner.tsx
 * Saves 7 modules (8→1)
 */

import * as React from "react";

// ═══════════════════════════════════════════════════════════════════════
// cn utility (was utils.ts)
// ═══════════════════════════════════════════════════════════════════════

type ClassInput = string | undefined | null | false | ClassInput[];

function flatten(inputs: ClassInput[]): string[] {
  const result: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      result.push(input);
    } else if (Array.isArray(input)) {
      result.push(...flatten(input));
    }
  }
  return result;
}

export function cn(...inputs: ClassInput[]): string {
  return flatten(inputs).join(' ');
}

// ═══════════════════════════════════════════════════════════════════════
// Button (was button.tsx)
// ═══════════════════════════════════════════════════════════════════════

const BTN_BASE = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";

const BTN_VARIANT: Record<string, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
  outline: "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
  link: "text-primary underline-offset-4 hover:underline",
};

const BTN_SIZE: Record<string, string> = {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
  lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
  icon: "size-9 rounded-md",
};

export function buttonVariants({ variant = "default", size = "default", className }: {
  variant?: string; size?: string; className?: string;
} = {}) {
  return cn(BTN_BASE, BTN_VARIANT[variant] || BTN_VARIANT.default, BTN_SIZE[size] || BTN_SIZE.default, className);
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: string;
  size?: string;
  asChild?: boolean;
}) {
  const { asChild, ...rest } = props;
  return (
    <button
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      {...rest}
    />
  );
}

export { Button };

// ═══════════════════════════════════════════════════════════════════════
// Badge (was badge.tsx)
// ═══════════════════════════════════════════════════════════════════════

const BADGE_BASE = "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden";

const BADGE_VARIANT: Record<string, string> = {
  default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
  secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
  destructive: "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
  outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
};

export function badgeVariants({ variant = "default", className }: {
  variant?: string; className?: string;
} = {}) {
  return cn(BADGE_BASE, BADGE_VARIANT[variant] || BADGE_VARIANT.default, className);
}

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: string; asChild?: boolean }) {
  const { asChild, ...rest } = props;
  return (
    <span
      data-slot="badge"
      className={badgeVariants({ variant, className })}
      {...rest}
    />
  );
}

export { Badge };

// ═══════════════════════════════════════════════════════════════════════
// Alert (was alert.tsx)
// ═══════════════════════════════════════════════════════════════════════

const ALERT_BASE = "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current";

const ALERT_VARIANT: Record<string, string> = {
  default: "bg-card text-card-foreground",
  destructive: "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
};

function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: string }) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(ALERT_BASE, ALERT_VARIANT[variant] || ALERT_VARIANT.default, className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };

// ═══════════════════════════════════════════════════════════════════════
// Input (was input.tsx)
// ═══════════════════════════════════════════════════════════════════════

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

// ═══════════════════════════════════════════════════════════════════════
// Textarea (was textarea.tsx)
// ═══════════════════════════════════════════════════════════════════════

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "resize-none border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-input-background px-3 py-2 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

// ═══════════════════════════════════════════════════════════════════════
// Card (was card.tsx)
// ═══════════════════════════════════════════════════════════════════════

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`rounded-lg border bg-white dark:bg-gray-800 text-gray-950 dark:text-gray-50 shadow-sm ${className || ''}`}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`flex flex-col space-y-1.5 p-6 ${className || ''}`}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={`text-2xl font-semibold leading-none tracking-tight ${className || ''}`}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={`text-sm text-gray-500 dark:text-gray-400 ${className || ''}`}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={`p-6 pt-0 ${className || ''}`} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`flex items-center p-6 pt-0 ${className || ''}`}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

// ═══════════════════════════════════════════════════════════════════════
// Label (was label.tsx — native label replacing @radix-ui/react-label)
// ═══════════════════════════════════════════════════════════════════════

function Label({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

// ═══════════════════════════════════════════════════════════════════════
// Toaster (was sonner.tsx — re-exports from sonner alias)
// ═══════════════════════════════════════════════════════════════════════

export { Toaster } from "sonner";