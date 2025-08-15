class EntryMap<_S extends State = State> {
  private lastKey = -1
  private map = new Map<Key['value'], Entry>()

  get<E extends EditorNode>(key: Key<E>): Entry<E> {
    const entry = this.map.get(key.value) as Entry<E> | undefined

    // To-Do: Add assert logic
    if (!entry) {
      throw new Error(`Entry with key ${key} not found`)
    }

    return entry
  }

  entries(): [Key['value'], Entry][] {
    return Array.from(this.map.entries())
  }

  set<E extends EditorNode>(
    this: EntryMap<Writable>,
    key: Key<E>,
    entry: Entry<E>,
  ) {
    this.map.set(key.value, entry)
  }

  generateKey<E extends EditorNode = EditorNode>(
    this: EntryMap<Writable>,
    { type: forType }: E,
  ): Key<E> {
    this.lastKey += 1
    return { type: 'key', forType, value: this.lastKey.toString() }
  }
}

const a = new EntryMap()
const b = a as EntryMap<Immutable>

b.generateKey({ type: 'text', value: '' }) // This will error because `b` is Immutable

type Immutable = 'readonly'
type Writable = 'editable'
type State = Immutable | Writable

// Description for the internal structure of the editor

type Entry<E extends EditorNode = EditorNode> = TypedValueFor<
  E['type'],
  'entry',
  EntryValue<E['value']>
> & {
  key: Key<E>
  parent: Key<EditorNode> | null
}

type EntryValue<V extends EditorNode['value']> = V extends EditorNode
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
