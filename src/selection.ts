import { isEqual } from 'es-toolkit'
import type { Index } from './nodes/node-description'
import type { NodeType } from './nodes/node-types'
import type { Entry } from './state/entry'
import { isKey, isKeyType, type Key } from './state/key'

export function getCursor(selection: Selection | null): Cursor | null {
  if (selection == null || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)

  const startPoint = getPoint(range.startContainer, range.startOffset)
  const endPoint = getPoint(range.endContainer, range.endOffset)

  if (startPoint == null || endPoint == null) return null

  return { start: startPoint, end: endPoint }
}

export function getPoint(
  node: Node | null,
  offset: number | null,
): Point | null {
  if (node == null) return null

  const htmlNode = node instanceof HTMLElement ? node : node.parentElement

  if (htmlNode == null) return null

  const { key } = htmlNode.dataset

  if (!isKey(key)) return null

  return isKeyType('text', key) && offset != null
    ? { key, index: offset }
    : { key }
}

export function isCollapsed({ start, end }: Cursor): boolean {
  return isEqual(start, end)
}

export type Path = PathFrame[]
type PathFrame = { entry: Entry; index?: Index }
export type IndexPath<T extends NodeType> = [Index<T>, ...Index[]] | []

export interface Cursor {
  start: Point
  end: Point
}

export interface Point {
  key: Key
  index?: number
}
