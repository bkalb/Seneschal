"use client"

import type { ComponentProps } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

type IconButtonProps = ComponentProps<typeof Button> & {
  tooltip: string
}

function IconButton({ tooltip, children, ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button {...props}>{children}</Button>} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export { IconButton }
