import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Input — clean, refined. Uses the warm border color.
 * Slightly reduced height on desktop (h-9) to match button sizing.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground ring-offset-background",
          "placeholder:text-muted-foreground/60",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary/50",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
          "transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
