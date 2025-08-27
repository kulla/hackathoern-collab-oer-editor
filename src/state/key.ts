import { isType, type NodeType } from '../nodes/node-types'

export type ParentKey = Key | null
export type Key<T extends NodeType = NodeType> = `${number}:${T}`

export function isKeyType<T extends NodeType>(
  type: T,
  key: Key,
): key is Key<T> {
  return parseType(key) === type
}

export function isKey(value: unknown): value is Key {
  if (typeof value !== 'string') return false

  const indexOfSeparator = value.indexOf(':')

  return (
    indexOfSeparator >= 0 &&
    !Number.isNaN(Number.parseInt(value.slice(0, indexOfSeparator), 10)) &&
    isType(value.slice(indexOfSeparator + 1))
  )
}

export function parseType<T extends NodeType>(key: Key<T>): T {
  const indexOfSeparator = key.indexOf(':')
  return key.slice(indexOfSeparator + 1) as T
}
