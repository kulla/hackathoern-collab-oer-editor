import { type Entry, isKey, type Key, parseType } from '../state'
import { ContentHandler, RootHandler } from './content'
import {
  BooleanHandler,
  MultipleChoiceAnswerHandler,
  MultipleChoiceAnswersHandler,
  MultipleChoiceHandler,
} from './multiple-choice'
import { ParagraphHandler } from './paragraph'
import { TextHandler } from './text'
import type { NodeHandler, NodeHandlerOf } from './types/node-handler'
import { isType, type NodeType } from './types/node-types'

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
