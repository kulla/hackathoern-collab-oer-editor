import { html as beautifyHtml } from 'js-beautify'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import './App.css'
import { isEqual } from 'es-toolkit'

const initialContent: Content = {
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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key.startsWith('Arrow')) return
      if (event.ctrlKey && event.key === 'r') return

      const cursor = manager.getState().getCursor()
      if (cursor == null) return

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
        {getHandler(rootEntry.forType).render(manager.getState(), rootEntry)}
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
                getHandler(rootEntry.forType).render(
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

const ContentHandler: NodeHandler<Content> = {
  insert(state, { value: children, type: forType }, parent) {
    return state.insert({
      forType,
      parent,
      createValue: (key) => {
        return children.map((child) =>
          ParagraphHandler.insert(state, child, key),
        )
      },
    })
  },
  read(state, key) {
    const { forType: type, value } = state.getEntry(key)
    return {
      type,
      value: value.map((childKey) => ParagraphHandler.read(state, childKey)),
    }
  },
  render(state, { key, value, forType }) {
    return (
      <div
        key={key.value}
        id={key.value}
        data-key={key.value}
        data-type={forType}
      >
        {value.map((childKey) =>
          ParagraphHandler.render(state, state.getEntry(childKey)),
        )}
      </div>
    )
  },
}

const ParagraphHandler: NodeHandler<Paragraph> = {
  insert(state, { value: child, type: forType }, parent) {
    return state.insert({
      forType,
      parent,
      createValue: (key) => TextHandler.insert(state, child, key),
    })
  },
  read(state, key) {
    const { forType: type, value } = state.getEntry(key)
    return { type, value: TextHandler.read(state, value) }
  },
  render(state, { key, value, forType }) {
    return (
      <p
        key={key.value}
        id={key.value}
        data-key={key.value}
        data-type={forType}
      >
        {TextHandler.render(state, state.getEntry(value))}
      </p>
    )
  },
}

const TextHandler: NodeHandler<TextValue> = {
  insert(state, { value, type: forType }, parent) {
    return state.insert({ forType, parent, createValue: () => value })
  },
  read(state, key) {
    const { forType: type, value } = state.getEntry(key)
    return { type, value }
  },
  render(_, { key, value, forType }) {
    return (
      <span
        key={key.value}
        id={key.value}
        data-key={key.value}
        data-type={forType}
      >
        {value}
      </span>
    )
  },
}

const handlers: Record<EditorNode['type'], NodeHandler<EditorNode>> = {
  content: ContentHandler,
  paragraph: ParagraphHandler,
  text: TextHandler,
}

function getHandler<E extends EditorNode>(type: E['type']): NodeHandler<E> {
  return handlers[type] as NodeHandler<E>
}

interface NodeHandler<E extends EditorNode> {
  insert(state: WritableState, node: E, parent: ParentKey): Key<E>
  read(state: ReadonlyState, key: Key<E>): E
  render(state: ReadonlyState, node: Entry<E>): ReactNode
}

// State manager

function useStateManager(initialContent: EditorNode) {
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

class StateManager {
  private readonly state = new WritableState()
  private readonly rootKey: Key<EditorNode>
  private updateListeners: (() => void)[] = []
  private updateCallDepth = 0
  private updateCount = 0

  constructor(initialContent: EditorNode) {
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

  read(): EditorNode {
    return getHandler(this.rootKey.forType).read(this.state, this.rootKey)
  }

  getState(): ReadonlyState {
    return this.state
  }

  getRootEntry(): Entry<EditorNode> {
    return this.state.getEntry(this.rootKey)
  }
}

// State management for an editor structure

class ReadonlyState {
  protected entries = new Map<Key['value'], Entry>()
  protected cursor: Cursor | null = null

  getEntry<E extends EditorNode>(key: Key<E>): Entry<E> {
    const entry = this.entries.get(key.value) as Entry<E> | undefined

    // To-Do: Add assert logic
    if (!entry) {
      throw new Error(`Entry with key ${key} not found`)
    }

    return entry
  }

  getEntries(): [Key['value'], Entry][] {
    return Array.from(this.entries.entries())
  }

  getCursor(): Cursor | null {
    return this.cursor
  }
}

class WritableState extends ReadonlyState {
  private lastKey = -1

  insert<E extends EditorNode>({
    forType,
    parent,
    createValue,
  }: UnstoredEntry<E>): Key<E> {
    const key = this.generateKey(forType)
    const value = createValue(key)

    this.set(key, { type: 'entry', key, forType, parent, value })

    return key
  }

  update<E extends EditorNode>(
    key: Key<E>,
    updateValue: (e: EntryValue<E>) => EntryValue<E>,
  ) {
    const entry = this.getEntry(key)
    const updatedValue = updateValue(entry.value)
    this.set(key, { ...entry, value: updatedValue })
  }

  setCursor(cursor: Cursor | null) {
    this.cursor = cursor
  }

  private set<E extends EditorNode>(key: Key<E>, entry: Entry<E>) {
    this.entries.set(key.value, entry)
  }

  private generateKey<E extends EditorNode = EditorNode>(
    forType: E['type'],
  ): Key<E> {
    this.lastKey += 1
    return { type: 'key', forType, value: this.lastKey.toString() }
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

  const { key, type } = htmlNode.dataset

  if (!isKeyValue(key) || !isType(type)) return null

  return type === 'text'
    ? { key: { type: 'key', forType: 'text', value: key }, offset }
    : { key: { type: 'key', forType: type, value: key } }
}

interface Cursor {
  start: Position
  end: Position
}

type Position = TextPosition | NodePosition

interface TextPosition {
  key: Key<TextValue>
  offset: number
}

interface NodePosition {
  key: Key<Exclude<EditorNode, TextValue>>
}

// Description for the internal structure of the editor

type Entry<E extends EditorNode = EditorNode> = TypedValueFor<
  E['type'],
  'entry',
  EntryValue<E>
> & {
  key: Key<E>
  parent: ParentKey
}
type UnstoredEntry<E extends EditorNode = EditorNode> = Omit<
  Entry<E>,
  'key' | 'value' | 'type'
> & { createValue: (key: Key<E>) => EntryValue<E> }

type EntryValue<E extends EditorNode> = ComputedEntryValue<E['value']>
type ComputedEntryValue<V extends EditorNode['value']> = V extends EditorNode
  ? Key<V>
  : V extends string | number | boolean
    ? V
    : V extends Array<infer U>
      ? U extends EditorNode
        ? Key<U>[]
        : never
      : V extends object
        ? { [K in keyof V]: V[K] extends EditorNode ? Key<V[K]> : never }
        : never

type ParentKey = Key<EditorNode> | null
type Key<E extends EditorNode = EditorNode> = TypedValueFor<
  E['type'],
  'key',
  string
>

function isType(value: unknown): value is EditorNode['type'] {
  return typeof value === 'string' && Object.keys(handlers).includes(value)
}

function isKeyValue(value: unknown): value is Key['value'] {
  return typeof value === 'string' && Number.isInteger(Number(value))
}

// Description of the external JSON for the editor structure

type EditorNode = Content | Paragraph | TextValue

type Content = TypedValue<'content', Paragraph[]>
type Paragraph = TypedValue<'paragraph', TextValue>
type TextValue = TypedValue<'text', string>

type TypedValueFor<
  F extends string,
  T extends string,
  U = unknown,
> = TypedValue<T, U> & { forType: F }
type TypedValue<T extends string = string, U = unknown> = { type: T; value: U }
