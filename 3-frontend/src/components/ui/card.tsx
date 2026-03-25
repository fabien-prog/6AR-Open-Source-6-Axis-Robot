import * as React from "react";

import { cn } from "@/lib/utils";

const glass =
  // Layout / stacking so overlays never fade text
  "relative isolate overflow-hidden rounded-2xl " +
  // Surface & vibrancy
  "bg-white/55 supports-[backdrop-filter]:bg-white/15 dark:bg-white/6 supports-[backdrop-filter]:dark:bg-white/6 " +
  "supports-[backdrop-filter]:backdrop-blur-2xl backdrop-saturate-150 dark:backdrop-saturate-125 " +
  // Edges
  "border border-black/10 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/10 " +
  // Depth
  "shadow-[0_10px_30px_-12px_rgba(0,0,0,0.14),0_2px_8px_-2px_rgba(0,0,0,0.06)] " +
  "dark:shadow-[0_22px_48px_-16px_rgba(0,0,0,0.55),0_2px_10px_-2px_rgba(0,0,0,0.35)] " +
  // Top sheen (behind content)
  "before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none before:rounded-[inherit] " +
  "before:bg-gradient-to-b before:from-white/30 before:to-transparent dark:before:from-white/6 dark:before:to-transparent " +
  // Gentle inner vignette (also behind content)
  "after:content-[''] after:absolute after:inset-0 after:-z-10 after:pointer-events-none after:rounded-[inherit] " +
  "after:bg-[radial-gradient(120%_60%_at_50%_-20%,rgba(255,255,255,0.22),transparent_60%)] " +
  "dark:after:bg-[radial-gradient(120%_60%_at_50%_-20%,rgba(255,255,255,0.04),transparent_60%)]";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("bg-card text-card-foreground flex flex-col gap-2 rounded-xl border py-6 shadow-sm", className, glass)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-2", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-6 [.border-t]:pt-2", className)} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
