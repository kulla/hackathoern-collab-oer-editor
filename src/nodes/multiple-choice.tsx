import type { IndexPath } from '../selection'
import type { StateManager } from '../state'
import { ContentHandler } from './content'
import { createArrayHandler, createPrimitiveHandler } from './helper'
import { TextHandler } from './text'
import type { NodeHandler } from './types/node-handler'

export const MultipleChoiceAnswerHandler: NodeHandler<'multipleChoiceAnswer'> =
  {
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

export const MultipleChoiceHandler: NodeHandler<'multipleChoice'> = {
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

export const MultipleChoiceAnswersHandler = createArrayHandler({
  type: 'multipleChoiceAnswers',
  childHandler: MultipleChoiceAnswerHandler,
})

export const BooleanHandler: NodeHandler<'boolean'> = {
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
