import { invariant } from 'es-toolkit'
import { WebrtcProvider } from 'y-webrtc'
import * as Y from 'yjs'
import type { NodeType } from '../nodes/types/node-types'
import type { Cursor, Point } from '../selection'
import type { Entry, EntryValue } from './entry'
import type { Key, ParentKey } from './key'

const doc: { ymap?: Y.Map<unknown> } = {}

function getEntries() {
  if (doc.ymap == null) {
    const ydoc = new Y.Doc()
    new WebrtcProvider(window.location.hash || 'editor', ydoc, {
      signaling: ['ws://localhost:32768'],
    })
    doc.ymap = ydoc.getMap('entries')
  }

  return doc.ymap
}

export class ReadonlyState {
  entries: Y.Map<unknown>

  constructor() {
    this.entries = getEntries()
  }

  getEntry<T extends NodeType>(key: Key<T>): Entry<T> {
    const entry = this.entries.get(key) as Entry<T> | undefined

    invariant(entry != null, `Entry with key ${key} not found`)

    return entry
  }

  getEntries(): [Key, Entry][] {
    return Object.entries(this.entries.toJSON()) as [Key, Entry][]
  }

  get cursor(): Cursor | null {
    return this.entries.get('cursor') as Cursor | null
  }

  get updateCount() {
    return (this.entries.get('counter') ?? 0) as number
  }
}

export class WritableState extends ReadonlyState {
  private lastKey = -1

  addUpdateListener(listener: () => void) {
    this.entries.observe(listener)
  }

  removeUpdateListener(listener: () => void) {
    this.entries.unobserve(listener)
  }

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

    return entry
  }

  incCounter() {
    const c = this.entries.get('counter') as number | null
    this.entries.set('counter', (c ?? 0) + 1)
  }

  update<T extends NodeType>(
    key: Key<T>,
    updateFn: EntryValue<T> | ((e: EntryValue<T>) => EntryValue<T>),
  ): Entry<T> {
    const { type, parent, value } = this.getEntry(key)
    const newValue = typeof updateFn === 'function' ? updateFn(value) : updateFn
    const newEntry = { type, key, parent, value: newValue }

    this.set(key, newEntry)

    return newEntry
  }

  setCursor(cursor: Cursor | null) {
    this.entries.set('cursor', cursor)
  }

  setCaret(point: Point) {
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

interface InsertArg<T extends NodeType, R> {
  type: T
  parent: ParentKey
  createValue: (key: Key<T>) => EntryValue<T> | R
}
