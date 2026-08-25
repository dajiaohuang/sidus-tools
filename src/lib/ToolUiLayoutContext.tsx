import { createContext, useContext, type ReactNode } from 'react'
import type { ToolUiLayout } from './tool-ui-layout'
import { parseToolUiLayout } from './tool-ui-layout'

const defaultLayout = parseToolUiLayout(new URLSearchParams())

const Ctx = createContext<ToolUiLayout>(defaultLayout)

export function ToolUiLayoutProvider({
  value,
  children,
}: {
  value: ToolUiLayout
  children: ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useToolUiLayout(): ToolUiLayout {
  return useContext(Ctx)
}
