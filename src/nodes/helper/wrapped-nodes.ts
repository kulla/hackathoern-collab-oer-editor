import type { IndexPath } from '../../selection'
import type { JSONValue } from '../types/node-description'
import type { NodeHandler } from '../types/node-handler'

export function createWrappedHandler<W extends WrappedNodes>({
  type,
  childHandler,
}: {
  type: W['type']
  childHandler: NodeHandler<W['childType']>
}): NodeHandler<W['type']> {
  return {
    insert(state, parent, { value: child }) {
      return state.insert({
        type,
        parent,
        createValue: (key) => childHandler.insert(state, key, child).key,
      })
    },
    createEmpty(state, parent) {
      return state.insert({
        type,
        parent,
        createValue: (key) => childHandler.createEmpty(state, key).key,
      })
    },
    read(state, key) {
      const { type, value } = state.getEntry(key)
      return { type, value: childHandler.read(state, value) } as JSONValue<
        W['type']
      >
    },
    selectStart(state, { value }) {
      childHandler.selectStart(state, state.getEntry(value))
    },
    selectEnd(state, { value }) {
      childHandler.selectEnd(state, state.getEntry(value))
    },
    select(state, { key, value }, [_, ...next]) {
      if (next == null) {
        state.setCaret({ key })
      } else {
        const child = state.getEntry<W['childType']>(value)

        childHandler.select(state, child, next as IndexPath<typeof child.type>)
      }
    },
    getIndexWithin() {
      return undefined as never
    },
    split(state, entry, [_, ...next], newParentKey) {
      const { parent, value } = entry
      if (next == null) return null

      const child = state.getEntry<W['childType']>(value)

      const newEntry = state.insert({
        type,
        parent: newParentKey ?? parent,
        createValue: (newParent) => {
          const split = childHandler.split(
            state,
            child,
            next as IndexPath<typeof child.type>,
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
      const child = state.getEntry<W['childType']>(value)
      const secondChild = state.getEntry<W['childType']>(secondValue)

      return childHandler.merge(state, child, secondChild)
    },
    onCommand: {},
    render() {
      throw new Error('not implemented yet')
    },
  }
}

type WrappedNodes = { type: 'paragraph'; childType: 'text' }
