import type { ReactNode } from 'react'
import type { Command, CommandPayload } from '../../command'
import type { IndexPath } from '../../selection'
import type {
  Entry,
  Key,
  ParentKey,
  ReadonlyState,
  StateManager,
  WritableState,
} from '../../state'
import type { Index, JSONValue } from './node-description'
import type { NodeType } from './node-types'

export type NodeHandler<T extends NodeType> = { [S in T]: NodeHandlerOf<S> }[T]

export interface NodeHandlerOf<T extends NodeType> {
  insert(state: WritableState, parent: ParentKey, node: JSONValue<T>): Entry<T>
  createEmpty(state: WritableState, parent: ParentKey): Entry<T>

  read(state: ReadonlyState, key: Key<T>): JSONValue<T>
  render(manager: StateManager<'root'>, node: Entry<T>): ReactNode
  getIndexWithin(entry: Entry<T>, child: Key): Index<T>

  select(state: WritableState, node: Entry<T>, at: IndexPath<T>): void
  selectStart(state: WritableState, node: Entry<T>): void
  selectEnd(state: WritableState, node: Entry<T>): void
  split(
    state: WritableState,
    node: Entry<T>,
    at: IndexPath<T>,
    parent?: ParentKey,
  ): [Entry<T>, Entry<T>] | null
  merge(state: WritableState, node: Entry<T>, withNode: Entry<T>): true | null
  onCommand: {
    [C in Command]?: (
      state: WritableState,
      node: Entry<T>,
      start: IndexPath<T>,
      end: IndexPath<T>,
      ...payload: CommandPayload<C>
    ) => { success: boolean } | null
  }
}
