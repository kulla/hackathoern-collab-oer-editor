import type { Key } from '../state/key'
import type { NodeType } from './node-types'

export type Index<T extends NodeType = NodeType> = T extends 'text'
  ? number
  : NodeDescription[T]['index']
export type JSONValue<T extends NodeType = NodeType> =
  NodeDescription[T]['jsonValue']

export interface NodeDescription {
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
