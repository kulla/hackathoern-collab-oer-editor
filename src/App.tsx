import { html as beautifyHtml } from 'js-beautify'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import './App.css'
import { isEqual } from 'es-toolkit'
import { icons } from 'feather-icons'
import { Command, type CommandPayload } from './command'
import { DebugPanel } from './components/debug-panel'
import type { Index, JSONValue } from './nodes/types/node-description'
import { isType, type NodeType } from './nodes/types/node-types'
import { getCursor, type IndexPath } from './selection'
import {
  type Entry,
  type EntryValue,
  isKey,
  type Key,
  type ParentKey,
  parseType,
  type ReadonlyState,
  type StateManager,
  useStateManager,
  type WritableState,
} from './state'

const initialContent: JSONValue<'root'> = [
  { type: 'paragraph', value: 'Welcome this is an editor example.' },
  { type: 'paragraph', value: 'Hello World' },
  {
    type: 'multipleChoice',
    task: [{ type: 'paragraph', value: 'What is 2 + 2?' }],
    answers: [
      { type: 'multipleChoiceAnswer', isCorrect: false, answer: '3' },
      { type: 'multipleChoiceAnswer', isCorrect: true, answer: '4' },
      { type: 'multipleChoiceAnswer', isCorrect: false, answer: '5' },
    ],
  },
]

export default function App() {
  const { manager } = useStateManager('root', initialContent)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        manager.dispatchCommand(Command.InsertText, event.key)
      } else if (event.key === 'Enter') {
        manager.dispatchCommand(Command.InsertNewElement)
      } else if (event.key === 'Backspace') {
        manager.dispatchCommand(Command.DeleteBackward)
      } else if (event.key === 'Delete') {
        manager.dispatchCommand(Command.DeleteForward)
      }

      if (
        (event.ctrlKey && ['c', 'v', 'x'].includes(event.key.toLowerCase())) ||
        ['Enter', 'Tab', 'Delete', 'Backspace'].includes(event.key) ||
        (event.key.length === 1 && !event.ctrlKey && !event.metaKey)
      ) {
        event.preventDefault()
      }
    },
    [manager],
  )

  const updateCursorFromSelection = useCallback(() => {
    const selection = document.getSelection()
    const cursor = getCursor(selection)
    if (!isEqual(cursor, manager.state.cursor)) {
      manager.update((state) => state.setCursor(cursor))
    }
  }, [manager])

  useEffect(() => {
    document.addEventListener('selectionchange', updateCursorFromSelection)

    return () => {
      document.removeEventListener('selectionchange', updateCursorFromSelection)
    }
  }, [updateCursorFromSelection])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Use updateCount to trigger re-render for each state change
  useLayoutEffect(() => {
    const { cursor } = manager.state
    const selection = document.getSelection()

    if (selection == null) return
    if (isEqual(cursor, getCursor(selection))) return

    selection.removeAllRanges()

    if (cursor == null) return

    const { start, end } = cursor

    const startNode = document.getElementById(start.key)
    const endNode = document.getElementById(end.key)

    if (startNode == null || endNode == null) return

    const range = document.createRange()

    if (start.index != null) {
      range.setStart(startNode.firstChild ?? startNode, start.index)
    } else {
      range.setStart(startNode, 0)
    }

    if (end.index != null) {
      range.setEnd(endNode.firstChild ?? endNode, end.index)
    } else {
      range.setEnd(endNode, 0)
    }

    selection.addRange(range)
  }, [manager, manager.state.updateCount])

  return (
    <main className="prose p-10">
      <h1>Editor:</h1>
      <div className="rounded-2xl border-2 border-blue-800 px-4">
        <article
          className="outline-none"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onKeyDown={handleKeyDown}
        >
          {manager.render()}
        </article>

        <div className="flex flex-row gap-2 mb-4  mt-8 border-t-2  border-t-blue-800 pt-4">
          <button
            type="button"
            onClick={() => {
              manager.dispatchCommand(Command.AddMultipleChoice)
            }}
            className={'btn btn-accent'}
          >
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(icons['check-circle'].toSvg())}`}
              className="inline mr-2"
              alt=""
            />
            Add Multiple Choice
          </button>
          <button
            type="button"
            onClick={() => {
              manager.dispatchCommand(Command.AddParagraph)
            }}
            className={'btn btn-warning'}
          >
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(icons['align-left'].toSvg())}`}
              className="inline mr-2"
              alt=""
            />
            Add Paragraph
          </button>
        </div>
      </div>
      <DebugPanel
        labels={
          {
            html: 'HTML output',
            selection: 'Current selection',
            state: 'External editor state',
            entities: 'Internal editor state',
          } as const
        }
        showOnStartup={{
          html: true,
          selection: true,
          state: false,
          entities: false,
        }}
        getCurrentValue={{
          html: () =>
            beautifyHtml(renderToStaticMarkup(manager.render()), {
              indent_size: 2,
              wrap_line_length: 70,
            }),
          selection: () =>
            JSON.stringify({ cursor: manager.state.cursor }, undefined, 2),
          state: () => JSON.stringify(manager.read(), undefined, 2),
          entities: () =>
            manager.state
              .getEntries()
              .map(([key, entry]) => `${key}: ${JSON.stringify(entry)}`)
              .join('\n'),
        }}
      />
    </main>
  )
}

function createArrayHandler<A extends ArrayNodes>({
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

// TODO: Automatically check which types T can be
function createPrimitiveHandler<T extends 'text' | 'boolean'>({
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

const TextHandler: NodeHandler<'text'> = {
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

function createWrappedHandler<W extends WrappedNodes>({
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

const ParagraphHandler: NodeHandler<'paragraph'> = {
  ...createWrappedHandler<{ type: 'paragraph'; childType: 'text' }>({
    type: 'paragraph',
    childHandler: TextHandler,
  }),
  render(manager, { key, value }) {
    return (
      <p id={key} key={key} data-key={key}>
        {TextHandler.render(manager, manager.state.getEntry(value))}
      </p>
    )
  },
}

const MultipleChoiceAnswerHandler: NodeHandler<'multipleChoiceAnswer'> = {
  insert(state, parent, { isCorrect, answer }) {
    return state.insert({
      type: 'multipleChoiceAnswer',
      parent,
      createValue: (key) => ({
        isCorrect: BooleanHandler.insert(state, key, isCorrect).key,
        answer: TextHandler.insert(state, key, answer).key,
      }),
    })
  },
  createEmpty(state, parent) {
    return state.insert({
      type: 'multipleChoiceAnswer',
      parent,
      createValue: (key) => ({
        isCorrect: BooleanHandler.createEmpty(state, key).key,
        answer: TextHandler.createEmpty(state, key).key,
      }),
    })
  },
  read(state, key) {
    const { isCorrect, answer } = state.getEntry(key).value
    return {
      type: 'multipleChoiceAnswer',
      isCorrect: BooleanHandler.read(state, isCorrect),
      answer: TextHandler.read(state, answer),
    }
  },
  render(manager, { key, value }) {
    const { isCorrect, answer } = value

    return (
      <div
        id={key}
        key={key}
        data-key={key}
        className="flex flex-row items-center mb-1"
      >
        {BooleanHandler.render(manager, manager.state.getEntry(isCorrect))}
        {TextHandler.render(manager, manager.state.getEntry(answer))}
      </div>
    )
  },
  selectStart(state, { value }) {
    TextHandler.selectStart(state, state.getEntry(value.answer))
  },
  selectEnd(state, { value }) {
    TextHandler.selectEnd(state, state.getEntry(value.answer))
  },
  split() {
    return null
  },
  merge() {
    return null
  },
  select(state, { key, value }, [part, ...next]) {
    if (part === 'isCorrect' && next != null) {
      const child = state.getEntry(value.isCorrect)

      BooleanHandler.select(state, child, next as IndexPath<'boolean'>)
    } else if (part === 'answer' && next != null) {
      const child = state.getEntry(value.answer)

      TextHandler.select(state, child, next as IndexPath<'text'>)
    } else {
      state.setCaret({ key })
    }
  },
  getIndexWithin({ value }, childKey) {
    if (childKey === value.isCorrect) return 'isCorrect'
    if (childKey === value.answer) return 'answer'
    throw new Error('Child not found')
  },
  onCommand: {},
}

const MultipleChoiceHandler: NodeHandler<'multipleChoice'> = {
  insert(state, parent, { task, answers }) {
    return state.insert({
      type: 'multipleChoice',
      parent,
      createValue: (key) => ({
        task: ContentHandler.insert(state, key, task).key,
        answers: MultipleChoiceAnswersHandler.insert(state, key, answers).key,
      }),
    })
  },
  createEmpty(state, parent) {
    return state.insert({
      type: 'multipleChoice',
      parent,
      createValue: (key) => ({
        task: ContentHandler.createEmpty(state, key).key,
        answers: MultipleChoiceAnswersHandler.createEmpty(state, key).key,
      }),
    })
  },
  read(state, key) {
    const { task, answers } = state.getEntry(key).value
    return {
      type: 'multipleChoice',
      task: ContentHandler.read(state, task),
      answers: MultipleChoiceAnswersHandler.read(state, answers),
    }
  },
  render(manager, { key, value }) {
    const { task, answers } = value

    return (
      <div
        id={key}
        key={key}
        data-key={key}
        className="px-4 mt-4 bg-blue-50 py-2 rounded-lg shadow-md"
      >
        <p className="font-medium font-sans">QUIZ</p>
        <div className="font-bold">
          {ContentHandler.render(manager, manager.state.getEntry(task))}
        </div>
        {MultipleChoiceAnswersHandler.render(
          manager,
          manager.state.getEntry(answers),
        )}
      </div>
    )
  },
  selectStart(state, { value }) {
    ContentHandler.selectStart(state, state.getEntry(value.task))
  },
  selectEnd(state, { value }) {
    MultipleChoiceAnswersHandler.selectEnd(state, state.getEntry(value.answers))
  },
  split() {
    return null
  },
  merge() {
    return null
  },
  select(state, { key, value }, [part, ...next]) {
    if (part === 'task' && next != null) {
      const child = state.getEntry(value.task)

      ContentHandler.select(state, child, next as IndexPath<'text'>)
    } else if (part === 'answers' && next != null) {
      const child = state.getEntry(value.answers)

      MultipleChoiceAnswersHandler.select(
        state,
        child,
        next as IndexPath<'text'>,
      )
    } else {
      state.setCaret({ key })
    }
  },
  getIndexWithin({ value }, childKey) {
    if (childKey === value.task) return 'task'
    if (childKey === value.answers) return 'answers'
    throw new Error('Child not found')
  },
  onCommand: {
    deleteBackward() {
      return { success: true }
    },
    deleteForward() {
      return { success: true }
    },
  },
}

const ContentHandler: NodeHandler<'content'> = createArrayHandler({
  type: 'content',
  childHandler: ParagraphHandler,
})
const RootHandler: NodeHandler<'root'> = createArrayHandler({
  type: 'root',
  childHandler: ParagraphHandler,
})
const BooleanHandler: NodeHandler<'boolean'> = {
  ...createPrimitiveHandler({
    type: 'boolean',
    emptyValue: false,
  }),
  render(manager: StateManager<'root'>, { key, value }) {
    return (
      <input
        id={key}
        key={key}
        data-key={key}
        type="checkbox"
        checked={value}
        className="checkbox mr-2 checkbox-info"
        onChange={() => {
          manager.update((state) => {
            state.update(key, !value)
          })
        }}
      />
    )
  },
}
const MultipleChoiceAnswersHandler = createArrayHandler({
  type: 'multipleChoiceAnswers',
  childHandler: MultipleChoiceAnswerHandler,
})

const handlers: { [T in NodeType]: NodeHandler<T> } = {
  root: RootHandler,
  content: ContentHandler,
  paragraph: ParagraphHandler,
  text: TextHandler,
  multipleChoice: MultipleChoiceHandler,
  multipleChoiceAnswer: MultipleChoiceAnswerHandler,
  multipleChoiceAnswers: MultipleChoiceAnswersHandler,
  boolean: BooleanHandler,
}

export function getHandler<T extends NodeType>(
  arg: T | Key<T> | Entry<T>,
): NodeHandlerOf<T> {
  // TODO: Remove type assertion when possible
  const type: T = isType(arg) ? arg : isKey(arg) ? parseType(arg) : arg.type

  return handlers[type]
}

type NodeHandler<T extends NodeType> = { [S in T]: NodeHandlerOf<S> }[T]
interface NodeHandlerOf<T extends NodeType> {
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
