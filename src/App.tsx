import './App.css'

export default function App() {
  return (
    <main className="prose p-10">
      <h1>Rsbuild with React</h1>
      <p>Start building amazing things with Rsbuild.</p>
    </main>
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
}

const TextHandler: NodeHandler<TextValue> = {
  insert(state, { value, type: forType }, parent) {
    return state.insert({ forType, parent, createValue: () => value })
  },
  read(state, key) {
    const { forType: type, value } = state.getEntry(key)
    return { type, value }
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
}

// State manager

function useStateManager(initialContent: EditorNode) {
  const managerRef = useRef({ manager: new StateManager(initialContent) })
  const { manager } = managerRef.current
  const lastUpdateCount = useRef(managerRef.current.manager.getUpdateCount())

  return useSyncExternalStore(
    (listener) => {
      manager.addUpdateListener(listener)

      return () => manager.removeUpdateListener(listener)
    },
    () => {
      if (lastUpdateCount.current === manager.getUpdateCount()) {
        return managerRef.current
      }

      // Create a new object so that React rerenders
      managerRef.current = { manager }

      return managerRef.current
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
}

// State management for an editor structure

class ReadonlyState {
  protected entries = new Map<Key['value'], Entry>()

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

// Description of the external JSON for the editor structure

type EditorNode = Content | Paragraph | TextValue

const paragraph: Paragraph = {
  type: 'paragraph',
  value: { type: 'text', value: 'This is a paragraph.' },
}

type Content = TypedValue<'content', Paragraph[]>
type Paragraph = TypedValue<'paragraph', TextValue>
type TextValue = TypedValue<'text', string>

type TypedValueFor<
  F extends string,
  T extends string,
  U = unknown,
> = TypedValue<T, U> & { forType: F }
type TypedValue<T extends string = string, U = unknown> = { type: T; value: U }
