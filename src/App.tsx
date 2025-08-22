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

const initialContent: TypedJSONValue<'content'> = {
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
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        manager.dispatchCommand(Command.InsertText, event.key)
      } else if (event.key === 'Enter') {
        manager.dispatchCommand(Command.InsertNewElement)
      } else if (event.key === 'Backspace') {
        manager.dispatchCommand(Command.DeleteBackward)
      } else if (event.key === 'Delete') {
        manager.dispatchCommand(Command.DeleteForward)
      }

      if (
        (event.ctrlKey && ['c', 'v', 'x'].includes(event.key)) ||
        ['Enter', 'Tab', 'Delete', 'Backspace'].includes(event.key) ||
        (event.key.length === 1 && !event.ctrlKey && !event.metaKey)
      ) {
        event.preventDefault()
      }
    },
    [manager],
  )

  const updateCursorFromSelection = useCallback(() => {
    const selection = document.getSelection()
    const cursor = getCursor(selection)
    if (!isEqual(cursor, manager.state.cursor)) {
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
    const { cursor } = manager.state
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
  }, [manager, manager.state.updateCount])

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
            JSON.stringify({ cursor: manager.state.cursor }, undefined, 2),
          state: () => JSON.stringify(manager.read(), undefined, 2),
          entities: () =>
            manager.state
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
        return children.map(
          (child) => ParagraphHandler.insert(state, child, key).key,
        )
      },
    })
  },
  createEmpty(state, parent) {
    return state.insert({
      type: 'content',
      parent,
      createValue: (key) => [ParagraphHandler.createEmpty(state, key).key],
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
  selectStart(state, { value }) {
    const firstChildKey = value[0]
    if (firstChildKey == null) return
    ParagraphHandler.selectStart(state, state.getEntry(firstChildKey))
  },
  selectEnd(state, { value }) {
    const lastChildKey = value[value.length - 1]
    if (lastChildKey == null) return
    ParagraphHandler.selectStart(state, state.getEntry(lastChildKey))
  },
  split() {
    throw new Error('not implemented yet')
  },
  merge() {
    throw new Error('not implemented yet')
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
  onCommand: {
    deleteRange(state, { key, value }, startPath, endPath) {
      const { index: startIndex, next: startNext } = startPath
      const { index: endIndex, next: endNext } = endPath
      const [start, end] = [startIndex ?? 0, endIndex ?? value.length]

      if (start === end) return null

      const left =
        startNext != null
          ? ParagraphHandler.split(state, startNext.entry, startNext)?.[0]
          : null
      const right =
        endNext != null
          ? ParagraphHandler.split(state, endNext.entry, endNext)?.[1]
          : null

      if (left && right) ParagraphHandler.merge(state, left, right)

      state.update(key, (children) => {
        const newChildren = [
          ...children.slice(0, start),
          ...(left != null ? [left.key] : []),
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

        const newChild = ParagraphHandler.createEmpty(state, key)
        ParagraphHandler.selectStart(state, newChild)

        return [newChild.key]
      })

      return { success: true }
    },
    insertNewElement(state, { key }, { index, next }, endPath) {
      if (index == null || index !== endPath?.index) return null
      const newChild = (() => {
        if (next != null) {
          const split = ParagraphHandler.split(state, next.entry, next)

          if (split != null) return split[1]
        }

        return ParagraphHandler.createEmpty(state, key)
      })()

      ParagraphHandler.selectStart(state, newChild)

      state.update(key, (children) => [
        ...children.slice(0, index + 1),
        newChild.key,
        ...children.slice(index + 1),
      ])

      return { success: true }
    },
    deleteForward(state, { key, value }, { index }, endPath) {
      if (index == null || index !== endPath?.index) return null
      if (value.length <= 1 || index >= value.length) return null

      const currentChild = state.getEntry(value[index])
      const nextChild = state.getEntry(value[index + 1])

      ParagraphHandler.merge(state, currentChild, nextChild)

      state.update(key, (children) =>
        children.filter((_, i) => i !== index + 1),
      )

      return { success: true }
    },
    deleteBackward(state, { key, value }, { index }, endPath) {
      if (index == null || index !== endPath?.index) return null
      if (value.length <= 1 || index <= 0) return null

      const currentChild = state.getEntry(value[index])
      const previousChild = state.getEntry(value[index - 1])

      ParagraphHandler.selectEnd(state, previousChild)
      ParagraphHandler.merge(state, previousChild, currentChild)

      state.update(key, (children) => children.filter((_, i) => i !== index))

      return { success: true }
    },
  },
}

const ParagraphHandler: NodeHandler<'paragraph'> = {
  insert(state, { value: child, type }, parent) {
    return state.insert({
      type,
      parent,
      createValue: (key) => TextHandler.insert(state, child, key).key,
    })
  },
  createEmpty(state, parent) {
    return state.insert({
      type: 'paragraph',
      parent,
      createValue: (key) => TextHandler.createEmpty(state, key).key,
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
    TextHandler.selectStart(state, state.getEntry(value))
  },
  selectEnd(state, { value }) {
    TextHandler.selectEnd(state, state.getEntry(value))
  },
  split(state, entry, { next }, newParentKey) {
    const { parent, value } = entry
    if (next == null) return null

    const child = state.getEntry(value)

    const newEntry = state.insert<'paragraph'>({
      type: 'paragraph',
      parent: newParentKey ?? parent,
      createValue: (newParent) => {
        const split = getHandler(child.type).split(
          state,
          child,
          next,
          newParent,
        )

        if (split == null) return null

        return split[1].key
      },
    })

    if (newEntry == null) return null

    return [entry, newEntry]
  },
  merge(state, { value }, { value: secondValue }) {
    const child = state.getEntry(value)
    const secondChild = state.getEntry(secondValue)

    return TextHandler.merge(state, child, secondChild)
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

    return getHandler(entry.parent).getPathToRoot(
      state,
      { kind: 'node', key: entry.parent },
      current,
    )
  },
  onCommand: {},
}

const TextHandler: NodeHandler<'text'> = {
  insert(state, { value, type }, parent) {
    return state.insert({ type, parent, createValue: () => value })
  },
  createEmpty(state, parent) {
    return state.insert({ type: 'text', parent, createValue: () => '' })
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
  selectEnd(state, { key, value }) {
    state.setCollapsedCursor({ kind: 'character', key, index: value.length })
  },
  merge(state, { key }, { value }) {
    state.update(key, (prev) => prev + value)
    return true
  },
  split(state, { parent, key, value }, { index }, newParentKey) {
    if (index == null || index >= value.length) return null

    const leftPart = value.slice(0, index)
    const rightPart = value.slice(index)

    return [
      state.update(key, leftPart),
      state.insert({
        type: 'text',
        parent: newParentKey ?? parent,
        createValue: () => rightPart,
      }),
    ]
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

    return getHandler(entry.parent).getPathToRoot(
      state,
      { kind: 'node', key: entry.parent },
      currentPath,
    )
  },
  onCommand: {
    insertText(state, { key }, { index }, endPath, text) {
      if (index == null || index !== endPath?.index) return null

      state.update(
        key,
        (prev) => prev.slice(0, index) + text + prev.slice(index),
      )
      state.setCollapsedCursor({
        kind: 'character',
        key,
        index: index + text.length,
      })

      return { success: true }
    },
    deleteRange(state, { key, value }, startPath, endPath) {
      const start = startPath?.index ?? 0
      const end = endPath?.index ?? value.length

      if (start === end) return null

      state.update(key, (prev) => prev.slice(0, start) + prev.slice(end))
      state.setCollapsedCursor({ kind: 'character', key, index: start })

      return { success: true }
    },
    deleteForward(state, { key, value }, { index }, endPath) {
      if (index == null || index !== endPath?.index) return null
      if (index >= value.length) return null

      state.update(key, (prev) => prev.slice(0, index) + prev.slice(index + 1))
      state.setCollapsedCursor({ kind: 'character', key: key, index })

      return { success: true }
    },
    deleteBackward(state, { key }, { index }, endPath) {
      if (index == null || index !== endPath?.index) return null
      if (index <= 0) return null

      state.update(key, (prev) => prev.slice(0, index - 1) + prev.slice(index))
      state.setCollapsedCursor({ kind: 'character', key, index: index - 1 })

      return { success: true }
    },
  },
}

const handlers: { [T in NodeType]: NodeHandler<T> } = {
  content: ContentHandler,
  paragraph: ParagraphHandler,
  text: TextHandler,
}

function getHandler<T extends NodeType>(type: T | Key<T>): NodeHandler<T> {
  return handlers[isType(type) ? type : parseType(type)]
}

interface NodeHandler<T extends NodeType = NodeType> {
  insert(
    state: WritableState,
    node: TypedJSONValue<T>,
    parent: ParentKey,
  ): Entry<T>
  createEmpty(state: WritableState, parent: ParentKey): Entry<T>

  read(state: ReadonlyState, key: Key<T>): TypedJSONValue<T>
  render(state: ReadonlyState, node: Entry<T>): ReactNode
  getPathToRoot(
    state: ReadonlyState,
    at: Point<T>,
    next?: Path<'entry', ChildType<T>>,
  ): Path<'entry'>

  select(state: WritableState, node: Entry<T>, at: Path<'index', T>): void
  selectStart(state: WritableState, node: Entry<T>): void
  selectEnd(state: WritableState, node: Entry<T>): void
  split(
    state: WritableState,
    node: Entry<T>,
    at: Path<'index', T>,
    parent?: ParentKey,
  ): [Entry<T>, Entry<T>] | null
  merge(state: WritableState, node: Entry<T>, withNode: Entry<T>): true | null
  onCommand: {
    [C in Command]?: (
      state: WritableState,
      node: Entry<T>,
      start: Path<'entry', T>,
      end: Path<'entry', T>,
      ...payload: OperationPayload<C>
    ) => { success: boolean } | null
  }
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

function isCollapsed({ start, end }: Cursor): boolean {
  return isEqual(start, end)
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

type IndexType<T extends NodeType> = IndexTypeOf<JSONValue<T>>
type IndexTypeOf<V extends JSONValue> = V extends string | Array<unknown>
  ? number
  : V extends JSONValue
    ? never
    : V extends object
      ? keyof V
      : never

// Operations for the editor structure

enum Command {
  InsertText = 'insertText',
  InsertNewElement = 'insertNewElement',
  DeleteRange = 'deleteRange',
  DeleteForward = 'deleteForward',
  DeleteBackward = 'deleteBackward',
}

type OperationPayload<O extends Command> = O extends Command.InsertText
  ? [string]
  : []

// State manager

function useStateManager(initialContent: TypedJSONValue) {
  const manager = useRef(new StateManager(initialContent)).current
  const lastReturn = useRef({ manager, updateCount: manager.state.updateCount })

  return useSyncExternalStore(
    (listener) => {
      manager.addUpdateListener(listener)

      return () => manager.removeUpdateListener(listener)
    },
    () => {
      if (lastReturn.current.updateCount === manager.state.updateCount) {
        return lastReturn.current
      }

      lastReturn.current = { manager, updateCount: manager.state.updateCount }

      return lastReturn.current
    },
  )
}

class StateManager<T extends NodeType = NodeType> {
  private readonly _state = new WritableState()
  private readonly rootKey: Key<T>
  private updateListeners: (() => void)[] = []
  private updateCallDepth = 0

  constructor(initialContent: TypedJSONValue<T>) {
    this.rootKey = getHandler(initialContent.type).insert(
      this._state,
      initialContent,
      null,
    ).key
  }

  addUpdateListener(listener: () => void): void {
    this.updateListeners.push(listener)
  }

  removeUpdateListener(listener: () => void): void {
    this.updateListeners = this.updateListeners.filter((l) => l !== listener)
  }

  update<R>(updateFn: (state: WritableState) => R): R {
    this.updateCallDepth += 1
    const result = updateFn(this._state)
    this.updateCallDepth -= 1

    if (this.updateCallDepth === 0) {
      for (const listener of this.updateListeners) {
        listener()
      }
    }
    return result
  }

  read(): TypedJSONValue<T> {
    return getHandler(this.rootKey).read(this._state, this.rootKey)
  }

  get state(): ReadonlyState {
    return this._state
  }

  render(): ReactNode {
    const rootEntry = this._state.getEntry(this.rootKey)
    return getHandler(rootEntry.type).render(this._state, rootEntry)
  }

  dispatchCommand<C extends Command>(
    command: C,
    ...payload: OperationPayload<C>
  ): boolean {
    return this.update((state) => {
      if (state.cursor == null) return true

      if (command !== Command.DeleteRange && !isCollapsed(state.cursor)) {
        const result = this.dispatchCommand(Command.DeleteRange)

        if (!result) return false
        if (
          command === Command.DeleteBackward ||
          command === Command.DeleteForward
        ) {
          // If we delete a range, we don't need to handle backward or forward deletion
          return true
        }
      }

      const { start, end } = state.cursor
      let startPath = getHandler(start.key).getPathToRoot(state, start)
      let endPath = getHandler(end.key).getPathToRoot(state, end)
      const targetNodeStack: Path<'entry'>[] = []

      while (startPath.entry.key === endPath.entry.key) {
        targetNodeStack.push(startPath)

        if (
          startPath.next != null &&
          endPath.next != null &&
          startPath.index === endPath.index
        ) {
          startPath = startPath.next
          endPath = endPath.next
        } else {
          break
        }
      }

      let targetNode = targetNodeStack.pop()?.entry ?? startPath.entry

      while (true) {
        const result = getHandler(targetNode.type).onCommand[command]?.(
          state,
          targetNode,
          startPath,
          endPath,
          ...payload,
        )

        if (result?.success) return true

        const nextTargetPath = targetNodeStack.pop()

        if (nextTargetPath == null) break

        startPath = nextTargetPath
        endPath = nextTargetPath
        targetNode = nextTargetPath.entry
      }

      return false
    })
  }
}

// State management for an editor structure

class ReadonlyState {
  protected entries = new Map<Key, Entry>()
  protected _cursor: Cursor | null = null
  protected _updateCount = 0

  getEntry<T extends NodeType>(key: Key<T>): Entry<T> {
    const entry = this.entries.get(key) as Entry<T> | undefined

    invariant(entry != null, `Entry with key ${key} not found`)

    return entry
  }

  getEntries(): [Key, Entry][] {
    return Array.from(this.entries.entries())
  }

  get cursor(): Cursor | null {
    return this._cursor
  }

  get updateCount() {
    return this._updateCount
  }
}

class WritableState extends ReadonlyState {
  private lastKey = -1

  insert<T extends NodeType>(arg: InsertArg<T, never>): Entry<T>
  insert<T extends NodeType>(arg: InsertArg<T, null>): Entry<T> | null
  insert<T extends NodeType>({
    type,
    parent,
    createValue,
  }: InsertArg<T, null>): Entry<T> | null {
    const key = this.generateKey(type)
    const value = createValue(key)

    if (value == null) return null

    const entry = { type, key, parent, value }

    this.set(key, entry)
    this._updateCount += 1

    return entry
  }

  update<T extends NodeType>(
    key: Key<T>,
    updateFn: EntryValue<T> | ((e: EntryValue<T>) => EntryValue<T>),
  ): Entry<T> {
    const { type, parent, value } = this.getEntry(key)
    const newValue = typeof updateFn === 'function' ? updateFn(value) : updateFn
    const newEntry = { type, key, parent, value: newValue }

    this.set(key, newEntry)
    this._updateCount += 1

    return newEntry
  }

  setCursor(cursor: Cursor | null) {
    this._cursor = cursor
    this._updateCount += 1
  }

  setCollapsedCursor(point: Point) {
    this.setCursor({ start: point, end: point })
  }

  private set<T extends NodeType>(key: Key<T>, entry: Entry<T>) {
    this.entries.set(key, entry as Entry)
    this._updateCount += 1
  }

  private generateKey<T extends NodeType>(type: T): Key<T> {
    this.lastKey += 1

    return `${this.lastKey}:${type}`
  }
}

type InsertArg<T extends NodeType, R> = Omit<Entry<T>, 'key' | 'value'> & {
  createValue: (key: Key<T>) => EntryValue<T> | R
}

// Description for the internal structure of the editor

type Entry<T extends NodeType = NodeType> = { [S in T]: EntryOfType<S> }[T]
interface EntryOfType<T extends NodeType = NodeType> {
  type: T
  key: Key<T>
  parent: ParentKey
  value: EntryValue<T>
}

type EntryValue<T extends NodeType> = ComputedEntryValue<JSONValue<T>>
type ComputedEntryValue<V extends JSONValue> = V extends TypedJSONValue
  ? Key<V['type']>
  : V extends string | number | boolean
    ? V
    : V extends Array<infer U>
      ? U extends TypedJSONValue
        ? Key<U['type']>[]
        : never
      : V extends object
        ? {
            [K in keyof V]: V[K] extends TypedJSONValue
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

interface TypedJSONValue<T extends NodeType = NodeType> {
  type: T
  value: JSONValue<T>
}

type isParent<T extends NodeType> = JSONValue<T> extends PrimitiveValue
  ? false
  : true
type PrimitiveValue = string | boolean | number

type JSONValue<T extends NodeType = NodeType> = JSONValueMap[T]

interface JSONValueMap {
  content: TypedJSONValue<'paragraph'>[]
  paragraph: TypedJSONValue<'text'>
  text: string
}

// Editor node types

type NodeType = 'content' | 'paragraph' | 'text'
