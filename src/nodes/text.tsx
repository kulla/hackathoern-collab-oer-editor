import { createPrimitiveHandler } from './helper/primitive-nodes'
import type { NodeHandler } from './types/node-handler'

export const TextHandler: NodeHandler<'text'> = {
  ...createPrimitiveHandler({ type: 'text', emptyValue: '' }),
  render(_, { key, value }) {
    return (
      <span
        id={key}
        key={key}
        data-key={key}
        className="text whitespace-pre-wrap"
      >
        {value}
      </span>
    )
  },
  selectStart(state, { key }) {
    state.setCaret({ key, index: 0 })
  },
  selectEnd(state, { key, value }) {
    state.setCaret({ key, index: value.length })
  },
  select(state, { key, value }, [index]) {
    state.setCaret({ key, index: index ?? value.length })
  },
  merge(state, { key }, { value }) {
    state.update(key, (prev) => prev + value)
    return true
  },
  split(state, { parent, key, value }, [index], newParentKey) {
    if (index == null || index >= value.length) return null

    const leftPart = value.slice(0, index)
    const rightPart = value.slice(index)

    return [
      state.update(key, leftPart),
      state.insert({
        type: 'text',
        parent: newParentKey ?? parent,
        createValue: () => rightPart,
      }),
    ]
  },
  onCommand: {
    insertText(state, { key }, [index], [endIndex], text) {
      if (index == null || index !== endIndex) return null

      state.update(
        key,
        (prev) => prev.slice(0, index) + text + prev.slice(index),
      )
      state.setCaret({ key, index: index + text.length })

      return { success: true }
    },
    deleteRange(state, { key, value }, [startIndex], [endIndex]) {
      const start = startIndex ?? 0
      const end = endIndex ?? value.length

      if (start === end) return null

      state.update(key, (prev) => prev.slice(0, start) + prev.slice(end))
      state.setCaret({ key, index: start })

      return { success: true }
    },
    deleteForward(state, { key, value }, [index], [endIndex]) {
      if (index == null || index !== endIndex) return null
      if (index >= value.length) return null

      state.update(key, (prev) => prev.slice(0, index) + prev.slice(index + 1))
      state.setCaret({ key: key, index })

      return { success: true }
    },
    deleteBackward(state, { key }, [index], [endIndex]) {
      if (index == null || index !== endIndex) return null
      if (index <= 0) return null

      state.update(key, (prev) => prev.slice(0, index - 1) + prev.slice(index))
      state.setCaret({ key, index: index - 1 })

      return { success: true }
    },
  },
}
