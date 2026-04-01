import figures from 'figures'
import React, {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTerminalSize } from '../../ink/use-terminal-size.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import Box from '../ink/components/Box.js'
import ScrollBox, { type ScrollBoxHandle } from '../ink/components/ScrollBox.js'
import Text from '../ink/components/Text.js'

/** Rows of transcript context kept visible above the modal pane divider. */
const MODAL_TRANSCRIPT_PEEK = 2

export type StickyPrompt = {
  text: string
  scrollTo: () => void
}

type MessageContentBlock = {
  type: string
  text?: string
}

export type Message = {
  uuid: string
  type: string
  message?: {
    content?: MessageContentBlock[]
  }
  renderMode?: string
  presentation?: string
  hidden?: boolean
  isNullRenderingAttachment?: boolean
}

export const ScrollChromeContext = createContext<{
  setStickyPrompt: (p: StickyPrompt | null) => void
}>({ setStickyPrompt: () => {} })

type Props = {
  top?: ReactNode
  scrollable: ReactNode
  bottom: ReactNode
  overlay?: ReactNode
  bottomFloat?: ReactNode
  modal?: ReactNode
  modalScrollRef?: React.RefObject<ScrollBoxHandle | null>
  scrollRef?: RefObject<ScrollBoxHandle | null>
  dividerYRef?: RefObject<number | null>
  hidePill?: boolean
  hideSticky?: boolean
  newMessageCount?: number
  onPillClick?: () => void
}

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return value === 1 ? singular : pluralForm
}

function isNullRenderingAttachment(message: Message): boolean {
  return Boolean(
    message.isNullRenderingAttachment ||
      message.hidden ||
      message.renderMode === 'none' ||
      message.presentation === 'none',
  )
}

export function useUnseenDivider(messageCount: number): {
  dividerIndex: number | null
  dividerYRef: RefObject<number | null>
  onScrollAway: (handle: ScrollBoxHandle) => void
  onRepin: () => void
  jumpToNew: (handle: ScrollBoxHandle | null) => void
  shiftDivider: (indexDelta: number, heightDelta: number) => void
} {
  const [dividerIndex, setDividerIndex] = useState<number | null>(null)
  const dividerYRef = React.useRef<number | null>(null)
  const countRef = React.useRef(messageCount)
  countRef.current = messageCount

  const onRepin = useCallback(() => {
    setDividerIndex(null)
  }, [])

  const onScrollAway = useCallback((handle: ScrollBoxHandle) => {
    const max = Math.max(
      0,
      handle.getScrollHeight() - handle.getViewportHeight(),
    )
    if (handle.getScrollTop() + handle.getPendingDelta() >= max) return

    if (dividerYRef.current === null) {
      dividerYRef.current = handle.getScrollHeight()
      setDividerIndex(countRef.current)
    }
  }, [])

  const jumpToNew = useCallback((handle: ScrollBoxHandle | null) => {
    handle?.scrollToBottom()
  }, [])

  useEffect(() => {
    if (dividerIndex === null) {
      dividerYRef.current = null
    } else if (messageCount < dividerIndex) {
      dividerYRef.current = null
      setDividerIndex(null)
    }
  }, [dividerIndex, messageCount])

  const shiftDivider = useCallback(
    (indexDelta: number, heightDelta: number) => {
      setDividerIndex(index =>
        index === null ? null : index + indexDelta,
      )
      if (dividerYRef.current !== null) {
        dividerYRef.current += heightDelta
      }
    },
    [],
  )

  return {
    dividerIndex,
    dividerYRef,
    onScrollAway,
    onRepin,
    jumpToNew,
    shiftDivider,
  }
}

export function countUnseenAssistantTurns(
  messages: readonly Message[],
  dividerIndex: number,
): number {
  let count = 0
  let prevWasAssistant = false

  for (let index = dividerIndex; index < messages.length; index++) {
    const message = messages[index]
    if (!message || message.type === 'progress') continue
    if (message.type === 'assistant' && !assistantHasVisibleText(message)) {
      continue
    }

    const isAssistant = message.type === 'assistant'
    if (isAssistant && !prevWasAssistant) count++
    prevWasAssistant = isAssistant
  }

  return count
}

function assistantHasVisibleText(message: Message): boolean {
  if (message.type !== 'assistant') return false
  return (
    message.message?.content?.some(
      block => block.type === 'text' && block.text?.trim(),
    ) ?? false
  )
}

export type UnseenDivider = { firstUnseenUuid: Message['uuid']; count: number }

export function computeUnseenDivider(
  messages: readonly Message[],
  dividerIndex: number | null,
): UnseenDivider | undefined {
  if (dividerIndex === null) return undefined

  let anchorIndex = dividerIndex
  while (
    anchorIndex < messages.length &&
    (messages[anchorIndex]?.type === 'progress' ||
      isNullRenderingAttachment(messages[anchorIndex]!))
  ) {
    anchorIndex++
  }

  const uuid = messages[anchorIndex]?.uuid
  if (!uuid) return undefined

  const count = countUnseenAssistantTurns(messages, dividerIndex)
  return { firstUnseenUuid: uuid, count: Math.max(1, count) }
}

export function FullscreenLayout({
  top,
  scrollable,
  bottom,
  overlay,
  bottomFloat,
  modal,
  scrollRef,
  dividerYRef,
  hidePill = false,
  hideSticky = false,
  newMessageCount = 0,
  onPillClick,
}: Props): React.ReactNode {
  const { rows: terminalRows, columns } = useTerminalSize()
  const [stickyPrompt, setStickyPrompt] = useState<StickyPrompt | null>(null)
  const chromeCtx = useMemo(() => ({ setStickyPrompt }), [])
  const subscribe = useCallback(
    (listener: () => void) =>
      scrollRef?.current?.subscribe(listener) ?? (() => {}),
    [scrollRef],
  )

  const pillVisible = useSyncExternalStore(subscribe, () => {
    const scrollHandle = scrollRef?.current
    const dividerY = dividerYRef?.current
    if (!scrollHandle || dividerY == null) return false
    return (
      scrollHandle.getScrollTop() +
        scrollHandle.getPendingDelta() +
        scrollHandle.getViewportHeight() <
      dividerY
    )
  })

  if (!isFullscreenEnvEnabled()) {
    return (
      <>
        {top}
        {scrollable}
        {bottom}
        {overlay}
        {modal}
      </>
    )
  }

  const headerPrompt = hideSticky ? null : stickyPrompt

  return (
    <>
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        {top ? (
          <Box flexShrink={0} width="100%">
            {top}
          </Box>
        ) : null}
        {headerPrompt && (
          <StickyPromptHeader
            text={headerPrompt.text}
            onClick={headerPrompt.scrollTo}
          />
        )}
        <ScrollBox
          ref={scrollRef as React.Ref<ScrollBoxHandle> | undefined}
          flexGrow={1}
          flexDirection="column"
          paddingTop={headerPrompt ? 0 : 1}
          stickyScroll
        >
          <ScrollChromeContext.Provider value={chromeCtx}>
            {scrollable}
          </ScrollChromeContext.Provider>
          {overlay}
        </ScrollBox>
        {!hidePill && pillVisible && (
          <NewMessagesPill count={newMessageCount} onClick={onPillClick} />
        )}
        {bottomFloat ? (
          <Box position="absolute" bottom={0} right={0} opaque>
            {bottomFloat}
          </Box>
        ) : null}
      </Box>

      <Box flexDirection="column" flexShrink={0} width="100%" maxHeight="50%">
        <Box flexDirection="column" width="100%" flexGrow={1} overflowY="hidden">
          {bottom}
        </Box>
      </Box>

      {modal ? (
        <Box
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          maxHeight={terminalRows - MODAL_TRANSCRIPT_PEEK}
          flexDirection="column"
          overflow="hidden"
          opaque
        >
          <Box flexShrink={0}>
            <Text>{'▔'.repeat(columns)}</Text>
          </Box>
          <Box flexDirection="column" paddingX={2} flexShrink={0} overflow="hidden">
            {modal}
          </Box>
        </Box>
      ) : null}
    </>
  )
}

function NewMessagesPill({
  count,
  onClick,
}: {
  count: number
  onClick?: () => void
}): React.ReactNode {
  const [hover, setHover] = useState(false)

  return (
    <Box
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      justifyContent="center"
    >
      <Box
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Text>
          {' '}
          {count > 0
            ? `${count} new ${plural(count, 'message')}`
            : 'Jump to bottom'}{' '}
          {figures.arrowDown}{' '}
        </Text>
      </Box>
    </Box>
  )
}

function StickyPromptHeader({
  text,
  onClick,
}: {
  text: string
  onClick: () => void
}): React.ReactNode {
  const [hover, setHover] = useState(false)

  return (
    <Box
      flexShrink={0}
      width="100%"
      height={1}
      paddingRight={1}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Text dim={hover}>
        {figures.pointer} {text}
      </Text>
    </Box>
  )
}

export default FullscreenLayout
