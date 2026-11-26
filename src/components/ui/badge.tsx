import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "../../lib/utils"
import { focusRingClass } from "../../lib/ui-classes"

const badgeVariants = cva(
  `group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 text-xs font-semibold whitespace-nowrap has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-red-500 [&>svg]:pointer-events-none [&>svg]:size-3! ${focusRingClass}`,
  {
    variants: {
      variant: {
        default:
          "bg-slate-900 text-white dark:bg-white dark:text-slate-950 [a]:hover:bg-slate-700 dark:[a]:hover:bg-slate-200",
        secondary:
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 [a]:hover:bg-slate-200 dark:[a]:hover:bg-slate-700",
        destructive:
          "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 [a]:hover:bg-red-100",
        outline:
          "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300 [a]:hover:bg-slate-50 dark:[a]:hover:bg-slate-800",
        ghost:
          "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        link: "text-blue-700 underline-offset-4 hover:underline dark:text-blue-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
