import { html as beautifyHtml } from 'js-beautify'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import './App.css'
import { isEqual } from 'es-toolkit'
import { icons } from 'feather-icons'
import { Command } from './command'
import { DebugPanel } from './components/debug-panel'
import type { JSONValue } from './nodes/types/node-description'
import { getCursor } from './selection'
import { useStateManager } from './state'

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
