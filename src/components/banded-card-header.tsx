// A CardHeader wearing the dark circuit-board band (see @/lib/circuit-art) —
// the same treatment as MetricCard's header, table headers and modal headers,
// so a card whose body is a table reads as one piece: banded title area on
// top, banded table header right below it.
//
// Opt-in rather than baked into the base CardHeader: that would restyle every
// card in the app (forms, settings, charts), which nobody asked for. Use this
// where a card should carry the band.
//
// Title, description and any icons inside inherit white (the description and
// icons carry text-muted-foreground, which the [&_.text-muted-foreground]
// override turns into a softer white). The rounded top corners match Card's
// rounded-xl so the band is clean even in a card that doesn't clip itself.

import * as React from "react";

import { CardHeader } from "@/components/ui/card";
import { useCircuitBand } from "@/lib/use-circuit-background";
import { cn } from "@/lib/utils";

export function BandedCardHeader({
  seed,
  className,
  style,
  ...props
}: React.ComponentProps<typeof CardHeader> & {
  /** Seeds the generated line art, so each card draws its own board. */
  seed: string;
}) {
  const { setRef, style: bandStyle } = useCircuitBand("card", seed);
  return (
    <CardHeader
      ref={setRef}
      className={cn(
        "rounded-t-[9px] text-white [&_.text-muted-foreground]:text-white/70",
        className,
      )}
      style={{ ...bandStyle, ...style }}
      {...props}
    />
  );
}
