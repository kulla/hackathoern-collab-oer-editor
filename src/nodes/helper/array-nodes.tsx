import { getHandler } from '../../App'
import type { IndexPath } from '../../selection'
import type { EntryValue, Key } from '../../state'
import { ParagraphHandler } from '../paragraph'
import type { Index, JSONValue } from '../types/node-description'
import type { NodeHandler } from '../types/node-handler'

export function createArrayHandler<A extends ArrayNodes>({
  type,
  childHandler,
}: A): NodeHandler<A['type']> {
  return {
    render(manager, { key, value }) {
      return (
        <div id={key} key={key} data-key={key}>
          {value.map((childKey) => {
            const child = manager.state.getEntry(childKey)
            return getHandler(child).render(manager, child)
          })}
        </div>
      )
    },
    insert(state, parent, children) {
      return state.insert({
        type,
        parent,
        createValue: (key) =>
          children.map(
            (child) => getHandler(child.type).insert(state, key, child).key,
          ) as EntryValue<A['type']>,
      })
    },
    createEmpty(state, parent) {
      // @ts-expect-error
      return state.insert({
        type,
        parent,
        createValue: (key) => [childHandler.createEmpty(state, key).key],
      })
    },
    read(state, key) {
      const value = state.getEntry(key).value
      return value.map((childKey) =>
        getHandler(childKey).read(state, childKey),
      ) as JSONValue<A['type']>
    },
    selectStart(state, { value }) {
      const firstChildKey = value[0]
      if (firstChildKey == null) return
      getHandler(firstChildKey).selectStart(
        state,
        state.getEntry(firstChildKey),
      )
    },
    selectEnd(state, { value }) {
      const lastChildKey = value[value.length - 1]
      if (lastChildKey == null) return
      getHandler(lastChildKey).selectStart(state, state.getEntry(lastChildKey))
    },
    split() {
      return null
    },
    merge() {
      return null
    },
    select() {
      throw new Error('not implemented yet')
    },
    getIndexWithin({ value }, childKey) {
      // TODO: Remove the 'as' cast when possible
      return (value as Key[]).indexOf(childKey) as Index<A['type']>
    },
    onCommand: {
      deleteRange(
        state,
        { key, value },
        [startIndex, ...startNext],
        [endIndex, ...endNext],
      ) {
        const [start, end] = [startIndex ?? 0, endIndex ?? value.length]

        if (start === end) return null

        const left =
          startNext != null
            ? getHandler(value[start]).split(
                state,
                state.getEntry(value[start]),
                startNext as IndexPath<'paragraph'>,
              )?.[0]
            : null
        const right =
          endNext != null
            ? getHandler(value[end]).split(
                state,
                state.getEntry(value[end]),
                endNext as IndexPath<'paragraph'>,
              )?.[1]
            : null

        if (left && right && left.type === right.type)
          getHandler(left).merge(state, left, right)

        state.update(key, (children) => {
          const newChildren = [
            ...children.slice(0, start),
            ...(left != null ? [left.key] : []),
            ...children.slice(end + 1),
          ]

          if (newChildren.length > 0) {
            const newEntry = state.getEntry(newChildren[start])

            if (startNext != null) {
              getHandler(newEntry).select(
                state,
                newEntry,
                startNext as IndexPath<'paragraph'>,
              )
            } else {
              getHandler(newEntry).selectStart(state, newEntry)
            }

            return newChildren as EntryValue<A['type']>
          }

          const newChild = ParagraphHandler.createEmpty(state, key)
          ParagraphHandler.selectStart(state, newChild)

          return [newChild.key] as EntryValue<A['type']>
        })

        return { success: true }
      },
      insertNewElement(state, { key, value }, [index, ...next], [endIndex]) {
        if (index == null || index !== endIndex) return null
        const newChild = (() => {
          if (next != null) {
            const split = getHandler(value[index]).split(
              state,
              state.getEntry(value[index]),
              next as IndexPath<'paragraph'>,
              key,
            )

            if (split != null) return split[1]
          }

          return childHandler.createEmpty(state, key)
        })()

        getHandler(newChild).selectStart(state, newChild)

        state.update(
          key,
          (children) =>
            [
              ...children.slice(0, index + 1),
              newChild.key,
              ...children.slice(index + 1),
            ] as EntryValue<A['type']>,
        )

        return { success: true }
      },
      deleteForward(state, { key, value }, [index], [endIndex]) {
        if (index == null || index !== endIndex) return null
        if (value.length <= 1 || index >= value.length) return null

        const currentChild = state.getEntry(value[index])
        const nextChild = state.getEntry(value[index + 1])

        if (currentChild.type === nextChild.type) {
          getHandler(currentChild).merge(state, currentChild, nextChild)
        }

        state.update(
          key,
          (children) =>
            children.filter((_, i) => i !== index + 1) as EntryValue<A['type']>,
        )

        return { success: true }
      },
      deleteBackward(state, { key, value }, [index], [endIndex]) {
        if (index == null || index !== endIndex) return null
        if (value.length <= 1 || index <= 0) return null

        const currentChild = state.getEntry(value[index])
        const previousChild = state.getEntry(value[index - 1])

        getHandler(previousChild).selectEnd(state, previousChild)

        if (previousChild.type === currentChild.type)
          getHandler(previousChild).merge(state, previousChild, currentChild)

        state.update(
          key,
          (children) =>
            children.filter((_, i) => i !== index) as EntryValue<A['type']>,
        )

        return { success: true }
      },
    },
  }
}

type ArrayNodes =
  | { type: 'root'; childHandler: NodeHandler<'paragraph'> }
  | { type: 'content'; childHandler: NodeHandler<'paragraph'> }
  | {
      type: 'multipleChoiceAnswers'
      childHandler: NodeHandler<'multipleChoiceAnswer'>
    }
