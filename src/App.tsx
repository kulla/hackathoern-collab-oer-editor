import { html as beautifyHtml } from 'js-beautify'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import './App.css'
import { invariant, isEqual } from 'es-toolkit'
import { DebugPanel } from './components/debug-panel'

const initialContent: ExternalTypedValue<'content'> = {
  type: 'content',
  value: [
    {
      type: 'paragraph',
      value: { type: 'text', value: 'Welcome this is an editor example.' },
    },
    { type: 'paragraph', value: { type: 'text', value: 'Hello World' } },
  ],
}

export default function App() {
  const { manager } = useStateManager(initialContent)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.shiftKey || event.key.startsWith('Arrow')) return

      const cursor = manager.getState().getCursor()
      if (cursor == null) return

      let { targetNodeStack, start, end } = getTargetNodeStack(
        manager.getState(),
        cursor,
      )

      let targetNode = targetNodeStack.pop()?.entry ?? start.entry

      while (true) {
        const isEventHandled = getHandler(targetNode.type).onKeyDown?.(
          manager,
          targetNode,
          event,
          start,
          end,
        )

        if (isEventHandled) {
          event.preventDefault()
          return
        }

        const nextTargetPath = targetNodeStack.pop()

        if (nextTargetPath == null) break

        start = nextTargetPath
        end = nextTargetPath
        targetNode = nextTargetPath.entry
      }

      if (
        (event.ctrlKey && ['c', 'v', 'x'].includes(event.key)) ||
        ['Enter', 'Tab', 'Delete', 'Backspace'].includes(event.key) ||
        (event.key.length === 1 && !event.ctrlKey && !event.metaKey)
      ) {
        event.preventDefault()
        return
      }
    },
    [manager],
  )

  const updateCursorFromSelection = useCallback(() => {
    const selection = document.getSelection()
    const cursor = getCursor(selection)
    if (!isEqual(cursor, manager.getState().getCursor())) {
      manager.update((state) => state.setCursor(cursor))
    }
  }, [manager])

  useEffect(() => {
    document.addEventListener('selectionchange', updateCursorFromSelection)

    return () => {
      document.removeEventListener('selectionchange', updateCursorFromSelection)
    }
  }, [updateCursorFromSelection])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Use updateCount to trigger re-render for each state change
  useLayoutEffect(() => {
    const cursor = manager.getState().getCursor()
    const selection = document.getSelection()

    if (selection == null) return
    if (isEqual(cursor, getCursor(selection))) return

    selection.removeAllRanges()

    if (cursor == null) return

    const { start, end } = cursor

    const startNode = document.getElementById(start.key)
    const endNode = document.getElementById(end.key)

    if (startNode == null || endNode == null) return

    const range = document.createRange()

    if (start.kind === 'character') {
      range.setStart(startNode.firstChild ?? startNode, start.index)
    } else {
      range.setStart(startNode, 0)
    }

    if (end.kind === 'character') {
      range.setEnd(endNode.firstChild ?? endNode, end.index)
    } else {
      range.setEnd(endNode, 0)
    }

    selection.addRange(range)
  }, [manager, manager.getUpdateCount()])

  return (
    <main className="prose p-10">
      <h1>Editor:</h1>
      <article
        className="rounded-xl border-2 px-4 outline-none max-w-3xl"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={handleKeyDown}
      >
        {manager.render()}
      </article>
      <DebugPanel
        labels={
          {
            html: 'HTML output',
            selection: 'Current selection',
            state: 'External editor state',
            entities: 'Internal editor state',
          } as const
        }
        showOnStartup={{
          html: true,
          selection: true,
          state: false,
          entities: false,
        }}
        getCurrentValue={{
          html: () =>
            beautifyHtml(renderToStaticMarkup(manager.render()), {
              indent_size: 2,
              wrap_line_length: 70,
            }),
          selection: () =>
            JSON.stringify(
              { cursor: manager.getState().getCursor() },
              undefined,
              2,
            ),
          state: () => JSON.stringify(manager.read(), undefined, 2),
          entities: () =>
            manager
              .getState()
              .getEntries()
              .map(([key, entry]) => `${key}: ${JSON.stringify(entry)}`)
              .join('\n'),
        }}
      />
    </main>
  )
}

// Handlers for managing editor nodes

const ContentHandler: NodeHandler<'content'> = {
  insert(state, { value: children, type }, parent) {
    return state.insert({
      type,
      parent,
      createValue: (key) => {
        return children.map((child) =>
          ParagraphHandler.insert(state, child, key),
        )
      },
    })
  },
  read(state, key) {
    const { type, value } = state.getEntry(key)
    return {
      type,
      value: value.map((childKey) => ParagraphHandler.read(state, childKey)),
    }
  },
  render(state, { key, value }) {
    return (
      <div id={key} key={key} data-key={key}>
        {value.map((childKey) =>
          ParagraphHandler.render(state, state.getEntry(childKey)),
        )}
      </div>
    )
  },
  onKeyDown(manager, node, event, startPath, endPath) {
    const { index: startIndex, next: startNext } = startPath
    const { index: endIndex, next: endNext } = endPath

    const start = startIndex ?? 0
    const end = endIndex ?? node.value.length

    if (event.key === 'Delete' || event.key === 'Backspace') {
      manager.update((state) => {
        state.update(node.key, (children) => {
          const left =
            startNext != null
              ? ParagraphHandler.splitAt(
                  ParagraphHandler.read(state, startNext.entry.key),
                  startNext,
                )?.[0]
              : null
          const right =
            endNext != null
              ? ParagraphHandler.splitAt(
                  ParagraphHandler.read(state, endNext.entry.key),
                  endNext,
                )?.[1]
              : null

          const merge =
            left && right ? ParagraphHandler.merge(left, right) : null

          const mergeKey =
            merge != null
              ? ParagraphHandler.insert(state, merge, node.key)
              : null

          const newChildren = [
            ...children.slice(0, start),
            ...(mergeKey != null ? [mergeKey] : []),
            ...children.slice(end + 1),
          ]

          if (newChildren.length > 0) {
            const newEntry = state.getEntry(newChildren[start])

            if (startNext != null) {
              ParagraphHandler.select(state, newEntry, startNext)
            } else {
              ParagraphHandler.selectStart(state, newEntry)
            }

            return newChildren
          }

          const newChild = ParagraphHandler.insert(
            state,
            { type: 'paragraph', value: { type: 'text', value: '' } },
            node.key,
          )

          ParagraphHandler.selectStart(state, state.getEntry(newChild))

          return [newChild]
        })
      })

      return true
    }

    if (event.key === 'Enter') {
      manager.update((state) => {
        const newChild = ParagraphHandler.insert(
          state,
          { type: 'paragraph', value: { type: 'text', value: '' } },
          node.key,
        )

        ParagraphHandler.selectStart(state, state.getEntry(newChild))

        state.update(node.key, (children) => {
          return [
            ...children.slice(0, end + 1),
            newChild,
            ...children.slice(end + 1),
          ]
        })
      })

      return true
    }

    return false
  },
  selectStart(state, { value }) {
    const firstChild = state.getEntry(value[0])
    ParagraphHandler.selectStart(state, firstChild)
  },
  splitAt() {
    // Investigate if splitting content is needed
    return null
  },
  merge() {
    // Investigate if merging content is needed
    return null
  },
  select() {
    throw new Error('not implemented yet')
  },
  getPathToRoot(state, { key }, next) {
    const entry = state.getEntry(key)
    const current: Path<'entry', 'content'> =
      next == null
        ? { kind: 'node', entry }
        : {
            kind: 'parent',
            entry,
            index: entry.value.indexOf(next.entry.key),
            next,
          }

    // TODO: Handle case where entry.parent is null
    return current
  },
}

const ParagraphHandler: NodeHandler<'paragraph'> = {
  insert(state, { value: child, type }, parent) {
    return state.insert({
      type,
      parent,
      createValue: (key) => TextHandler.insert(state, child, key),
    })
  },
  read(state, key) {
    const { type, value } = state.getEntry(key)
    return { type, value: TextHandler.read(state, value) }
  },
  render(state, { key, value }) {
    return (
      <p id={key} key={key} data-key={key}>
        {TextHandler.render(state, state.getEntry(value))}
      </p>
    )
  },
  selectStart(state, { value }) {
    const textEntry = state.getEntry(value)
    TextHandler.selectStart(state, textEntry)
  },
  splitAt({ value }, { next }) {
    if (next == null) return null

    const split = getHandler(value.type).splitAt(value, next)

    return split != null
      ? [
          { type: 'paragraph', value: split[0] },
          { type: 'paragraph', value: split[1] },
        ]
      : null
  },
  merge(left, right) {
    const value = TextHandler.merge(left.value, right.value)

    if (value == null) return null

    return { type: 'paragraph', value }
  },
  select(state, { key, value }, { next }) {
    if (next == null) {
      state.setCollapsedCursor({ kind: 'node', key })
    } else {
      const child = state.getEntry(value)

      TextHandler.select(state, child, next)
    }
  },
  getPathToRoot(state, { key }, next) {
    const entry = state.getEntry(key)
    const current: Path<'entry', 'paragraph'> =
      next == null
        ? { kind: 'node', entry }
        : { kind: 'parent', entry, index: null as never, next }

    if (entry.parent === null) return current

    return getHandler(parseType(entry.parent)).getPathToRoot(
      state,
      { kind: 'node', key: entry.parent },
      current,
    )
  },
}

const TextHandler: NodeHandler<'text'> = {
  insert(state, { value, type }, parent) {
    return state.insert({ type, parent, createValue: () => value })
  },
  read(state, key) {
    const { type, value } = state.getEntry(key)
    return { type, value }
  },
  render(_, { key, value }) {
    return (
      <span
        id={key}
        key={key}
        data-key={key}
        className="text whitespace-pre-wrap"
      >
        {value}
      </span>
    )
  },
  selectStart(state, { key }) {
    state.setCollapsedCursor({ kind: 'character', key, index: 0 })
  },
  onKeyDown(manager, node, event, startPath, endPath) {
    const start = startPath?.index ?? 0
    const end = endPath?.index ?? node.value.length

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      manager.update((state) => {
        state.update(
          node.key,
          (prev) => prev.slice(0, start) + event.key + prev.slice(end),
        )
        state.setCollapsedCursor({
          kind: 'character',
          key: node.key,
          index: start + 1,
        })
      })

      return true
    }

    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      start !== end
    ) {
      manager.update((state) => {
        state.update(node.key, (prev) => prev.slice(0, start) + prev.slice(end))
        state.setCollapsedCursor({
          kind: 'character',
          key: node.key,
          index: start,
        })
      })

      return true
    }

    if (event.key === 'Backspace' && start > 0) {
      manager.update((state) => {
        state.update(
          node.key,
          (prev) => prev.slice(0, start - 1) + prev.slice(start),
        )
        state.setCollapsedCursor({
          kind: 'character',
          key: node.key,
          index: start - 1,
        })
      })

      return true
    }

    if (event.key === 'Delete' && start < node.value.length) {
      manager.update((state) => {
        state.update(
          node.key,
          (prev) => prev.slice(0, start) + prev.slice(start + 1),
        )
      })

      return true
    }

    return false
  },
  splitAt({ value }, { index }) {
    if (index == null) return null

    return [
      { type: 'text', value: value.slice(0, index) },
      { type: 'text', value: value.slice(index) },
    ]
  },
  merge(left, right) {
    return { type: 'text', value: left.value + right.value }
  },
  select(state, { key, value }, { index }) {
    state.setCollapsedCursor({
      kind: 'character',
      key,
      index: index ?? value.length,
    })
  },
  getPathToRoot(state, { kind, key, index }) {
    const entry = state.getEntry(key)
    const currentPath: Path<'entry'> =
      kind === 'character'
        ? { kind: 'character', entry, index: index }
        : { kind: 'node', entry }

    if (entry.parent === null) return currentPath

    return getHandler(parseType(entry.parent)).getPathToRoot(
      state,
      { kind: 'node', key: entry.parent },
      currentPath,
    )
  },
}

const handlers: { [T in NodeType]: NodeHandler<T> } = {
  content: ContentHandler,
  paragraph: ParagraphHandler,
  text: TextHandler,
}

function getHandler<T extends NodeType>(type: T): NodeHandler<T> {
  return handlers[type]
}

interface NodeHandler<T extends NodeType = NodeType> {
  insert(
    state: WritableState,
    node: ExternalTypedValue<T>,
    parent: ParentKey,
  ): Key<T>
  read(state: ReadonlyState, key: Key<T>): ExternalTypedValue<T>
  render(state: ReadonlyState, node: Entry<T>): ReactNode
  onKeyDown?(
    manager: StateManager,
    node: Entry<T>,
    event: KeyboardEvent,
    start: Path<'entry', T>,
    end: Path<'entry', T>,
  ): boolean
  select(state: WritableState, node: Entry<T>, at: Path<'index', T>): void
  selectStart(state: WritableState, node: Entry<T>): void
  splitAt(
    node: ExternalTypedValue<T>,
    index: Path<'index', T>,
  ): [ExternalTypedValue<T>, ExternalTypedValue<T>] | null
  merge(
    left: ExternalTypedValue<T>,
    right: ExternalTypedValue<T>,
  ): ExternalTypedValue<T> | null
  getPathToRoot(
    state: ReadonlyState,
    at: Point<T>,
    next?: Path<'entry', ChildType<T>>,
  ): Path<'entry'>
}

// Selection

function getCursor(selection: Selection | null): Cursor | null {
  if (selection == null || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)

  const startPoint = getPoint(range.startContainer, range.startOffset)
  const endPoint = getPoint(range.endContainer, range.endOffset)

  if (startPoint == null || endPoint == null) return null

  return { start: startPoint, end: endPoint }
}

function getPoint(node: Node | null, offset: number | null): Point | null {
  if (node == null) return null

  const htmlNode = node instanceof HTMLElement ? node : node.parentElement

  if (htmlNode == null) return null

  const { key } = htmlNode.dataset

  if (!isKey(key)) return null

  return isKeyType('text', key) && offset != null
    ? { kind: 'character', key, index: offset }
    : { kind: 'node', key }
}

function getTargetNodeStack(
  state: ReadonlyState,
  cursor: Cursor,
): {
  targetNodeStack: Path<'entry'>[]
  start: Path<'entry'>
  end: Path<'entry'>
} {
  let start = getHandler(parseType(cursor.start.key)).getPathToRoot(
    state,
    cursor.start,
  )
  let end = getHandler(parseType(cursor.end.key)).getPathToRoot(
    state,
    cursor.end,
  )
  const targetNodeStack: Path<'entry'>[] = []

  while (start.entry.key === end.entry.key) {
    targetNodeStack.push(start)

    if (start.next != null && end.next != null && start.index === end.index) {
      start = start.next
      end = end.next
    } else {
      break
    }
  }

  return { targetNodeStack, start, end }
}

// TODO: Update to "caret" or "range"
interface Cursor {
  start: Point
  end: Point
}

type Point<T extends NodeType = NodeType> = { [S in T]: PointOfType<S> }[T]
type PointOfType<T extends NodeType> = T extends 'text'
  ? CharacterLeaf<'key'> | NodeLeaf<'key', T>
  : NodeLeaf<'key', T>

type Path<P extends PathType, T extends NodeType = NodeType> = {
  [S in T]: PathOfType<P, S>
}[T]
type PathOfType<
  P extends PathType,
  T extends NodeType,
> = isParent<T> extends true
  ? Parent<P, T> | NodeLeaf<P, T>
  : T extends 'text'
    ? CharacterLeaf<P> | NodeLeaf<P, T>
    : NodeLeaf<P, T>

type Parent<P extends PathType, T extends NodeType = NodeType> = {
  kind: 'parent'
  index: IndexType<T>
  next: Path<P, ChildType<T>>
} & Extension<P, T>

type NodeLeaf<P extends PathType, T extends NodeType = NodeType> = {
  kind: 'node'
  index?: never
  next?: never
} & Extension<P, T>

type CharacterLeaf<P extends PathType> = {
  kind: 'character'
  index: number
  next?: never
} & Extension<P, 'text'>

type Extension<P extends PathType, T extends NodeType> = P extends 'key'
  ? { key: Key<T> }
  : P extends 'entry'
    ? { entry: Entry<T> }
    : unknown
type PathType = 'key' | 'entry' | 'index'

type ChildType<T extends NodeType> = T extends 'content'
  ? 'paragraph'
  : T extends 'paragraph'
    ? 'text'
    : never

type IndexType<T extends NodeType> = IndexTypeOf<ExternalValue<T>>
type IndexTypeOf<V extends ExternalValue> = V extends string | Array<unknown>
  ? number
  : V extends ExternalValue
    ? never
    : V extends object
      ? keyof V
      : never

// State manager

function useStateManager(initialContent: ExternalTypedValue) {
  const manager = useRef(new StateManager(initialContent)).current
  const lastReturn = useRef({ manager, updateCount: manager.getUpdateCount() })

  return useSyncExternalStore(
    (listener) => {
      manager.addUpdateListener(listener)

      return () => manager.removeUpdateListener(listener)
    },
    () => {
      if (lastReturn.current.updateCount === manager.getUpdateCount()) {
        return lastReturn.current
      }

      lastReturn.current = { manager, updateCount: manager.getUpdateCount() }

      return lastReturn.current
    },
  )
}

class StateManager<T extends NodeType = NodeType> {
  private readonly state = new WritableState()
  private readonly rootKey: Key<T>
  private updateListeners: (() => void)[] = []
  private updateCallDepth = 0
  private updateCount = 0

  constructor(initialContent: ExternalTypedValue<T>) {
    this.rootKey = getHandler(initialContent.type).insert(
      this.state,
      initialContent,
      null,
    )
  }

  addUpdateListener(listener: () => void): void {
    this.updateListeners.push(listener)
  }

  removeUpdateListener(listener: () => void): void {
    this.updateListeners = this.updateListeners.filter((l) => l !== listener)
  }

  update(updateFn: (state: WritableState) => void): void {
    this.updateCallDepth += 1
    updateFn(this.state)
    this.updateCallDepth -= 1

    if (this.updateCallDepth === 0) {
      this.updateCount += 1

      for (const listener of this.updateListeners) {
        listener()
      }
    }
  }

  getUpdateCount() {
    return this.updateCount
  }

  read(): ExternalTypedValue<T> {
    return getHandler(parseType(this.rootKey)).read(this.state, this.rootKey)
  }

  getState(): ReadonlyState {
    return this.state
  }

  render(): ReactNode {
    const rootEntry = this.state.getEntry(this.rootKey)
    return getHandler(rootEntry.type).render(this.state, rootEntry)
  }
}

// State management for an editor structure

class ReadonlyState {
  protected entries = new Map<Key, Entry>()
  protected cursor: Cursor | null = null

  getEntry<T extends NodeType>(key: Key<T>): Entry<T> {
    const entry = this.entries.get(key) as Entry<T> | undefined

    invariant(entry != null, `Entry with key ${key} not found`)

    return entry
  }

  getEntries(): [Key, Entry][] {
    return Array.from(this.entries.entries())
  }

  getCursor(): Cursor | null {
    return this.cursor
  }
}

class WritableState extends ReadonlyState {
  private lastKey = -1

  insert<T extends NodeType>({
    type,
    parent,
    createValue,
  }: UnstoredEntry<T>): Key<T> {
    const key = this.generateKey(type)

    this.set(key, { type, key, parent, value: createValue(key) })

    return key
  }

  update<T extends NodeType>(
    key: Key<T>,
    updateValue: (e: EntryValue<T>) => EntryValue<T>,
  ) {
    const entry = this.getEntry(key)

    this.set(key, { ...entry, value: updateValue(entry.value) })
  }

  setCursor(cursor: Cursor | null) {
    this.cursor = cursor
  }

  setCollapsedCursor(point: Point) {
    this.setCursor({ start: point, end: point })
  }

  private set<T extends NodeType>(key: Key<T>, entry: Entry<T>) {
    this.entries.set(key, entry as Entry)
  }

  private generateKey<T extends NodeType>(type: T): Key<T> {
    this.lastKey += 1

    return `${this.lastKey}:${type}`
  }
}
// Description for the internal structure of the editor

type Entry<T extends NodeType = NodeType> = { [S in T]: EntryOfType<S> }[T]
interface EntryOfType<T extends NodeType = NodeType> {
  type: T
  key: Key<T>
  parent: ParentKey
  value: EntryValue<T>
}
type UnstoredEntry<T extends NodeType> = Omit<Entry<T>, 'key' | 'value'> & {
  createValue: (key: Key<T>) => EntryValue<T>
}

type EntryValue<T extends NodeType> = ComputedEntryValue<ExternalValue<T>>
type ComputedEntryValue<V extends ExternalValue> = V extends ExternalTypedValue
  ? Key<V['type']>
  : V extends string | number | boolean
    ? V
    : V extends Array<infer U>
      ? U extends ExternalTypedValue
        ? Key<U['type']>[]
        : never
      : V extends object
        ? {
            [K in keyof V]: V[K] extends ExternalTypedValue
              ? Key<V[K]['type']>
              : never
          }
        : never

type ParentKey = Key | null
type Key<T extends NodeType = NodeType> = { [S in T]: KeyOfType<S> }[T]
type KeyOfType<T extends NodeType> = `${number}:${T}`

function isKeyType<T extends NodeType>(type: T, key: Key): key is Key<T> {
  return key.endsWith(type)
}

function isType(value: unknown): value is NodeType {
  return typeof value === 'string' && Object.keys(handlers).includes(value)
}

function isKey(value: unknown): value is Key {
  if (typeof value !== 'string') return false

  const indexOfSeparator = value.indexOf(':')

  return (
    indexOfSeparator >= 0 &&
    !Number.isNaN(Number.parseInt(value.slice(0, indexOfSeparator), 10)) &&
    isType(value.slice(indexOfSeparator + 1))
  )
}

function parseType<T extends NodeType>(key: Key<T>): T {
  const indexOfSeparator = key.indexOf(':')
  return key.slice(indexOfSeparator + 1) as T
}

// Description of the external JSON for the editor structure

// To-Do: Find a better name than "ExternalValue"
interface ExternalTypedValue<T extends NodeType = NodeType> {
  type: T
  value: ExternalValue<T>
}

type isParent<T extends NodeType> = ExternalValue<T> extends PrimitiveValue
  ? false
  : true
type PrimitiveValue = string | boolean | number

type ExternalValue<T extends NodeType = NodeType> = ExternalValueMap[T]

interface ExternalValueMap {
  content: ExternalTypedValue<'paragraph'>[]
  paragraph: ExternalTypedValue<'text'>
  text: string
}

// Editor node types

type NodeType = 'content' | 'paragraph' | 'text'
