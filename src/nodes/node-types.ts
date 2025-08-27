/**
 * Complete list of types used in the editor.
 */
export type NodeType = (typeof nodeTypes)[number]
const nodeTypes = [
  'content',
  'paragraph',
  'text',
  'multipleChoice',
  'root',
  'multipleChoiceAnswers',
  'multipleChoiceAnswer',
  'boolean',
] as const

/**
 * Type guard to check if a value is a valid NodeType.
 */
export function isType(value: unknown): value is NodeType {
  return typeof value === 'string' && nodeTypes.includes(value as NodeType)
}
