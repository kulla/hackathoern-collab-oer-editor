const ParagraphHandler: NodeHandler<Paragraph> = {
  insert(state, { value: child, type: forType }, parent) {
    const childKey = TextHandler.insert(state, child, null)

    return state.insert({ forType, value: childKey, parent })
  },
}

const TextHandler: NodeHandler<TextValue> = {
  insert(state, { value, type: forType }, parent) {
    return state.insert({ forType, value, parent })
  },
}

interface NodeHandler<E extends EditorNode> {
  insert(state: WritableState, node: E, parent: Key<EditorNode> | null): Key<E>
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

  insert<E extends EditorNode>(entry: UnstoredEntry<E>): Key<E> {
    const key = this.generateKey(entry)
    this.set(key, { ...entry, type: 'entry', key })
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

  private generateKey<E extends EditorNode = EditorNode>({
    forType,
  }: UnstoredEntry<E>): Key<E> {
    this.lastKey += 1
    return { type: 'key', forType, value: this.lastKey.toString() }
  }
}

// Description for the internal structure of the editor

interface Entry<E extends EditorNode = EditorNode> extends UnstoredEntry<E> {
  type: 'entry'
  key: Key<E>
}
interface UnstoredEntry<E extends EditorNode = EditorNode> {
  forType: E['type']
  parent: ParentKey
  value: EntryValue<E>
}

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
