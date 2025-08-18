import { html as beautifyHtml } from 'js-beautify'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import './App.css'
import { isEqual } from 'es-toolkit'

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
  const rootEntry = manager.getRootEntry()
  const cursor = manager.getState().getCursor()

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key.startsWith('Arrow')) return
      if (event.ctrlKey && event.key === 'r') return

      const cursor = manager.getState().getCursor()
      if (cursor == null) return

      const { start, end } = cursor

      if (start.key === end.key) {
        const entry = manager.getState().getEntry(start.key)

        getHandler(entry.type).onKeyDown?.(manager, entry, event, cursor)
      }

      event.preventDefault()
    },
    [manager],
  )

  const handleSelectionChange = useCallback(() => {
    const selection = document.getSelection()
    const cursor = getCursor(selection)
    if (!isEqual(cursor, manager.getState().getCursor())) {
      manager.update((state) => state.setCursor(cursor))
    }
  }, [manager])

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [handleSelectionChange])

  useLayoutEffect(() => {
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

    if ('offset' in start) {
      range.setStart(startNode.firstChild ?? startNode, start.offset)
    } else {
      range.setStart(startNode, 0)
    }

    if ('offset' in end) {
      range.setEnd(endNode.firstChild ?? endNode, end.offset)
    } else {
      range.setEnd(endNode, 0)
    }

    selection.addRange(range)
  }, [cursor])

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
        {getHandler(rootEntry.type).render(manager.getState(), rootEntry)}
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
          state: true,
          entities: false,
        }}
        getCurrentValue={{
          html: () =>
            beautifyHtml(
              renderToStaticMarkup(
                getHandler(rootEntry.type).render(
                  manager.getState(),
                  rootEntry,
                ),
              ),
              { indent_size: 2, wrap_line_length: 70 },
            ),
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

interface DebugPanelProps<T extends string> {
  labels: Record<T, string>
  getCurrentValue: Record<T, () => string>
  showOnStartup: Record<T, boolean>
}

function DebugPanel<T extends string>({
  labels,
  getCurrentValue,
  showOnStartup,
}: DebugPanelProps<T>) {
  const [show, setShow] = useState(showOnStartup)

  const options = Object.keys(labels) as T[]

  return (
    <>
      <h2>Debug Panel</h2>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Options</legend>
        {options.map((option) => (
          <label key={option} className="label">
            <input
              type="checkbox"
              className="toggle"
              checked={show[option]}
              onChange={() =>
                setShow((prev) => ({ ...prev, [option]: !prev[option] }))
              }
            />{' '}
            {labels[option]}
          </label>
        ))}
      </fieldset>
      <div className="flex gap-4">
        {options.map((option) =>
          show[option] ? (
            <pre key={option} className="max-w-xl h-132">
              {getCurrentValue[option]()}
            </pre>
          ) : null,
        )}
      </div>
    </>
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
      <div key={key} id={key} data-key={key}>
        {value.map((childKey) =>
          ParagraphHandler.render(state, state.getEntry(childKey)),
        )}
      </div>
    )
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
      <p key={key} id={key} data-key={key}>
        {TextHandler.render(state, state.getEntry(value))}
      </p>
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
      <span key={key} id={key} data-key={key}>
        {value}
      </span>
    )
  },
  onKeyDown(manager, node, event, { start, end }) {
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      if ('offset' in start && 'offset' in end) {
        manager.update((state) => {
          state.update(
            node.key,
            (prev) =>
              prev.slice(0, start.offset) + event.key + prev.slice(end.offset),
          )
          state.setCursor({
            start: { ...start, offset: start.offset + 1 },
            end: { ...start, offset: start.offset + 1 },
          })
        })
      }
    }

    return false
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
    currentSelection: Cursor,
  ): boolean
}

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

  getRootEntry(): Entry<T> {
    return this.state.getEntry(this.rootKey)
  }
}

// State management for an editor structure

class ReadonlyState {
  protected entries = new Map<Key, Entry>()
  protected cursor: Cursor | null = null

  getEntry<T extends NodeType>(key: Key<T>): Entry<T> {
    const entry = this.entries.get(key) as Entry<T> | undefined

    // To-Do: Add assert logic
    if (!entry) {
      throw new Error(`Entry with key ${key} not found`)
    }

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

  private set<T extends NodeType>(key: Key<T>, entry: Entry<T>) {
    this.entries.set(key, entry)
  }

  private generateKey<T extends NodeType>(type: T): Key<T> {
    this.lastKey += 1

    return `${this.lastKey}:${type}`
  }
}

// Selection

function getCursor(selection: Selection | null): Cursor | null {
  if (selection == null || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const startPosition = getPosition(range.startContainer, range.startOffset)
  const endPosition = getPosition(range.endContainer, range.endOffset)

  if (startPosition == null || endPosition == null) return null

  return {
    start: startPosition,
    end: endPosition,
  }
}

function getPosition(
  node: Node | null,
  offset: number | null,
): Position | null {
  if (node == null || offset == null) return null

  const htmlNode = node instanceof HTMLElement ? node : node.parentElement

  if (htmlNode == null) return null

  const { key } = htmlNode.dataset

  if (!isKey(key)) return null

  return isKeyType('text', key) ? { key, offset } : { key }
}

interface Cursor {
  start: Position
  end: Position
}

type Position = TextPosition | NodePosition

interface TextPosition {
  key: Key<'text'>
  offset: number
}

interface NodePosition {
  key: Key<Exclude<NodeType, 'text'>>
}

// Description for the internal structure of the editor

interface Entry<T extends NodeType = NodeType> {
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
type Key<T extends NodeType = NodeType> = `${number}:${T}`

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

interface ExternalValueMap {
  content: ExternalTypedValue<'paragraph'>[]
  paragraph: ExternalTypedValue<'text'>
  text: string
}

type ExternalValue<T extends NodeType = NodeType> = ExternalValueMap[T]

// Editor node types

type NodeType = 'content' | 'paragraph' | 'text'
