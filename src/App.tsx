import { html as beautifyHtml } from 'js-beautify'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import './App.css'
import { invariant, isEqual, takeWhile, zip } from 'es-toolkit'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { DebugPanel } from './components/debug-panel'

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
  console.log('Rerender')

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
      <article
        className="rounded-xl border-2 px-4 outline-none max-w-3xl"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={handleKeyDown}
      >
        {manager.render()}
      </article>
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

function createArrayHandler<
  T extends 'content' | 'root' | 'multipleChoiceAnswers',
>(type: T): NodeHandler<T> {
  return {
    render(state, { key, value }) {
      return (
        <div id={key} key={key} data-key={key}>
          {value.map((childKey) => {
            const child = state.getEntry(childKey)
            return getHandler(child).render(state, child)
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
          ) as EntryValue<T>,
      })
    },
    createEmpty(state, parent) {
      return state.insert({
        type,
        parent,
        createValue: (key) => [ParagraphHandler.createEmpty(state, key).key],
      })
    },
    read(state, key) {
      const value = state.getEntry(key).value
      return value.map((childKey) =>
        getHandler(childKey).read(state, childKey),
      ) as JSONValue<T>
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
      return (value as Key[]).indexOf(childKey) as Index<T>
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

            return newChildren as EntryValue<T>
          }

          const newChild = ParagraphHandler.createEmpty(state, key)
          ParagraphHandler.selectStart(state, newChild)

          return [newChild.key] as EntryValue<T>
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

          return ParagraphHandler.createEmpty(state, key)
        })()

        getHandler(newChild).selectStart(state, newChild)

        state.update(
          key,
          (children) =>
            [
              ...children.slice(0, index + 1),
              newChild.key,
              ...children.slice(index + 1),
            ] as EntryValue<T>,
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
            children.filter((_, i) => i !== index + 1) as EntryValue<T>,
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
          (children) => children.filter((_, i) => i !== index) as EntryValue<T>,
        )

        return { success: true }
      },
    },
  }
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
  render(state, { key, value }) {
    return (
      <p id={key} key={key} data-key={key}>
        {TextHandler.render(state, state.getEntry(value))}
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
  render(state, { key, value }) {
    const { isCorrect, answer } = value

    return (
      <div id={key} key={key} data-key={key}>
        {BooleanHandler.render(state, state.getEntry(isCorrect))}
        {TextHandler.render(state, state.getEntry(answer))}
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
  render(state, { key, value }) {
    const { task, answers } = value

    return (
      <div
        id={key}
        key={key}
        data-key={key}
        className="px-4 bg-lime-900 rounded-lg mb-4"
      >
        <h4>Tasks</h4>
        {ContentHandler.render(state, state.getEntry(task))}
        <h4>Answers</h4>
        {MultipleChoiceAnswersHandler.render(state, state.getEntry(answers))}
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
  onCommand: {},
}

const ContentHandler: NodeHandler<'content'> = createArrayHandler('content')
const RootHandler: NodeHandler<'root'> = createArrayHandler('root')
const BooleanHandler: NodeHandler<'boolean'> = {
  ...createPrimitiveHandler({
    type: 'boolean',
    emptyValue: false,
  }),
  render(_, { key, value }) {
    return (
      <input
        id={key}
        key={key}
        data-key={key}
        type="checkbox"
        checked={value}
        readOnly
        className="mr-2"
      />
    )
  },
}
const MultipleChoiceAnswersHandler = createArrayHandler('multipleChoiceAnswers')

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

function getHandler<T extends NodeType>(
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
  render(state: ReadonlyState, node: Entry<T>): ReactNode
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

// Selection

function getCursor(selection: Selection | null): Cursor | null {
  if (selection == null || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)

  const startPoint = getPoint(range.startContainer, range.startOffset)
  const endPoint = getPoint(range.endContainer, range.endOffset)

  if (startPoint == null || endPoint == null) return null

  return { start: startPoint, end: endPoint }
}

function getPoint(node: Node | null, offset: number | null): Point | null {
  if (node == null) return null

  const htmlNode = node instanceof HTMLElement ? node : node.parentElement

  if (htmlNode == null) return null

  const { key } = htmlNode.dataset

  if (!isKey(key)) return null

  return isKeyType('text', key) && offset != null
    ? { key, index: offset }
    : { key }
}

function isCollapsed({ start, end }: Cursor): boolean {
  return isEqual(start, end)
}

type Path = PathFrame[]
type PathFrame = { entry: Entry; index?: Index }
type IndexPath<T extends NodeType> = [Index<T>, ...Index[]] | []

interface Cursor {
  start: Point
  end: Point
}

interface Point {
  key: Key
  index?: number
}

// Operations for the editor structure

enum Command {
  InsertText = 'insertText',
  InsertNewElement = 'insertNewElement',
  DeleteRange = 'deleteRange',
  DeleteForward = 'deleteForward',
  DeleteBackward = 'deleteBackward',
}

type CommandPayload<O extends Command> = O extends Command.InsertText
  ? [string]
  : []

// State manager

function useStateManager<T extends NodeType>(type: T, initial: JSONValue<T>) {
  const manager = useRef(new StateManager(type, initial)).current
  const lastReturn = useRef({ manager, updateCount: manager.state.updateCount })

  return useSyncExternalStore(
    (listener) => {
      manager.addUpdateListener(listener)

      return () => manager.removeUpdateListener(listener)
    },
    () => {
      console.log(manager.state.updateCount)

      if (lastReturn.current.updateCount === manager.state.updateCount) {
        return lastReturn.current
      }

      lastReturn.current = { manager, updateCount: manager.state.updateCount }

      return lastReturn.current
    },
  )
}

class StateManager<T extends NodeType = NodeType> {
  private readonly _state = new WritableState()
  private readonly rootKey: Key<T>
  private updateCallDepth = 0
  private listener: (() => void)[] = []
  private updateFunc
  private lastUpdateCount

  constructor(type: T, initial: JSONValue<T>) {
    this.rootKey =
      this._state.entries.get('0:root') == null
        ? getHandler(type).insert(this._state, null, initial).key
        : ('0:root' as Key<T>)
    this.lastUpdateCount = this._state.updateCount
    this.updateFunc = () => {
      if (this.lastUpdateCount !== this._state.updateCount) {
        this.lastUpdateCount = this._state.updateCount

        for (const l of this.listener) l()
      }
    }
  }

  addUpdateListener(listener: () => void): void {
    this.listener.push(listener)
    this._state.addUpdateListener(this.updateFunc)
  }

  removeUpdateListener(listener: () => void): void {
    this.listener = this.listener.filter((x) => x !== listener)
    this._state.removeUpdateListener(this.updateFunc)
  }

  update<R>(updateFn: (state: WritableState) => R): R {
    this.updateCallDepth += 1
    const result = updateFn(this._state)
    this.updateCallDepth -= 1

    if (this.updateCallDepth === 0) {
      this._state.incCounter()
    }
    return result
  }

  read(): JSONValue<T> {
    return getHandler(this.rootKey).read(this._state, this.rootKey)
  }

  get state(): ReadonlyState {
    return this._state
  }

  render(): ReactNode {
    const rootEntry = this._state.getEntry(this.rootKey)
    return getHandler(rootEntry.type).render(this._state, rootEntry)
  }

  dispatchCommand<C extends Command>(
    command: C,
    ...payload: CommandPayload<C>
  ): boolean {
    return this.update((state) => {
      if (state.cursor == null) return true

      if (command !== Command.DeleteRange && !isCollapsed(state.cursor)) {
        const result = this.dispatchCommand(Command.DeleteRange)

        if (!result) return false
        if (
          command === Command.DeleteBackward ||
          command === Command.DeleteForward
        ) {
          // If we delete a range, we don't need to handle backward or forward deletion
          return true
        }
      }

      const { start, end } = state.cursor
      const startPath = getPathToRoot(state, start)
      const endPath = getPathToRoot(state, end)

      const commonPath: Path = takeWhile(
        zip(startPath, endPath),
        ([a, b]) => a.entry.key === b.entry.key,
      ).map(([a, _]) => a)
      const startIndex = startPath
        .slice(Math.max(commonPath.length - 1, 0))
        .map(({ index }) => index)
      const endIndex = endPath
        .slice(Math.max(commonPath.length - 1, 0))
        .map(({ index }) => index)

      let targetNode = commonPath.pop()?.entry ?? startPath[0].entry

      while (true) {
        // TODO: Remove type assertions when possible
        const result = getHandler(targetNode.type).onCommand[command]?.(
          state,
          targetNode,
          startIndex as IndexPath<typeof targetNode.type>,
          endIndex as IndexPath<typeof targetNode.type>,
          ...payload,
        )

        if (result?.success) return true

        const nextTargetPath = commonPath.pop()

        if (nextTargetPath == null) break

        startIndex.unshift(nextTargetPath.index)
        endIndex.unshift(nextTargetPath.index)
        targetNode = nextTargetPath.entry
      }

      return false
    })
  }
}

function getPathToRoot(state: ReadonlyState, point: Point): Path {
  const entry = state.getEntry(point.key)
  const path: Path =
    point.index != null ? [{ entry, index: point.index }] : [{ entry }]

  while (path[0].entry.parent != null) {
    const parent = state.getEntry(path[0].entry.parent)
    const index = getHandler(parent).getIndexWithin(parent, path[0].entry.key)
    path.unshift({ entry: parent, index })
  }

  return path
}

// State management for an editor structure

const doc: { ymap?: Y.Map<unknown> } = {}

function getEntries() {
  if (doc.ymap == null) {
    const ydoc = new Y.Doc()
    new WebrtcProvider('editor', ydoc, { signaling: ['wss://localhost:4444'] })
    doc.ymap = ydoc.getMap('entries')
  }

  return doc.ymap
}

class ReadonlyState {
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

class WritableState extends ReadonlyState {
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

// Description for the internal structure of the editor

type Entry<T extends NodeType = NodeType> = { [S in T]: EntryOf<S> }[T]
interface EntryOf<T extends NodeType> {
  type: T
  key: Key<T>
  parent: ParentKey
  value: EntryValue<T>
}
type EntryValue<T extends NodeType> = NodeDescription[T]['entryValue']

type ParentKey = Key | null
type Key<T extends NodeType = NodeType> = `${number}:${T}`

function isKeyType<T extends NodeType>(type: T, key: Key): key is Key<T> {
  return parseType(key) === type
}

function isType(value: unknown): value is NodeType {
  return typeof value === 'string' && Object.keys(handlers).includes(value)
}

function isKey(value: unknown): value is Key {
  if (typeof value !== 'string') return false

  const indexOfSeparator = value.indexOf(':')

  return (
    indexOfSeparator >= 0 &&
    !Number.isNaN(Number.parseInt(value.slice(0, indexOfSeparator), 10)) &&
    isType(value.slice(indexOfSeparator + 1))
  )
}

function parseType<T extends NodeType>(key: Key<T>): T {
  const indexOfSeparator = key.indexOf(':')
  return key.slice(indexOfSeparator + 1) as T
}

type Index<T extends NodeType = NodeType> = T extends 'text'
  ? number
  : NodeDescription[T]['index']
type JSONValue<T extends NodeType = NodeType> = NodeDescription[T]['jsonValue']

interface NodeDescription {
  multipleChoice: ObjectNode<
    'multipleChoice',
    { task: 'content'; answers: 'multipleChoiceAnswers' }
  >
  content: ArrayNode<'paragraph'>
  root: ArrayNode<'paragraph' | 'multipleChoice'>
  paragraph: WrappedNode<'paragraph', 'text'>
  text: PrimitiveNode<string>
  multipleChoiceAnswers: ArrayNode<'multipleChoiceAnswer'>
  multipleChoiceAnswer: ObjectNode<
    'multipleChoiceAnswer',
    { answer: 'text'; isCorrect: 'boolean' }
  >
  boolean: PrimitiveNode<boolean>
}

interface ObjectNode<T extends NodeType, O extends Record<string, NodeType>> {
  entryValue: { [K in keyof O]: Key<O[K]> }
  jsonValue: { [K in keyof O]: JSONValue<O[K]> } & { type: T }
  index: keyof O
}

interface ArrayNode<C extends NodeType> {
  entryValue: Key<C>[]
  jsonValue: Array<JSONValue<C>>
  index: number
}

interface WrappedNode<T extends NodeType, C extends NodeType> {
  entryValue: Key<C>
  jsonValue: { [S in T]: { type: T; value: JSONValue<C> } }[T]
  index: never
}

interface PrimitiveNode<C extends boolean | number | string> {
  entryValue: C
  jsonValue: C
  index: never
}

/*
 * Complete list of types used in the editor.
 */
type NodeType =
  | 'content'
  | 'paragraph'
  | 'text'
  | 'multipleChoice'
  | 'root'
  | 'multipleChoiceAnswers'
  | 'multipleChoiceAnswer'
  | 'boolean'
