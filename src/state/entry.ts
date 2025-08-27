import type { NodeDescription } from '../nodes/node-description'
import type { NodeType } from '../nodes/node-types'
import type { Key, ParentKey } from './key'

export type Entry<T extends NodeType = NodeType> = { [S in T]: EntryOf<S> }[T]
interface EntryOf<T extends NodeType> {
  type: T
  key: Key<T>
  parent: ParentKey
  value: EntryValue<T>
}

export type EntryValue<T extends NodeType> = NodeDescription[T]['entryValue']
