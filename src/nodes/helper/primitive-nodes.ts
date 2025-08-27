import type { EntryValue } from '../../state'
import type { NodeHandler } from '../types/node-handler'

export function createPrimitiveHandler<T extends 'text' | 'boolean'>({
  type,
  emptyValue,
}: {
  type: T
  emptyValue: EntryValue<T>
}): NodeHandler<T> {
  return {
    insert(state, parent, value) {
      return state.insert({ type, parent, createValue: () => value })
    },
    createEmpty(state, parent) {
      return state.insert({ type, parent, createValue: () => emptyValue })
    },
    read(state, key) {
      return state.getEntry(key).value
    },
    selectStart(state, { key }) {
      state.setCaret({ key })
    },
    selectEnd(state, { key }) {
      state.setCaret({ key })
    },
    select(state, { key }) {
      state.setCaret({ key })
    },
    merge() {
      return null
    },
    split() {
      return null
    },
    getIndexWithin() {
      throw new Error('Primitive nodes cannot have children')
    },
    onCommand: {},
    render() {
      throw new Error('not implemented yet')
    },
  }
}
