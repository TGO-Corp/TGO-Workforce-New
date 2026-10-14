import * as React from "react";
import { CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Keep the interface so every module receives the same quiet header.
export function BandedCardHeader({
  seed: _seed,
  className,
  ...props
}: React.ComponentProps<typeof CardHeader> & { seed: string }) {
  return (
    <CardHeader className={cn("border-b border-border/60 bg-muted/20", className)} {...props} />
  );
}
