import { takeWhile, zip } from 'es-toolkit'
import { type ReactNode, useRef, useSyncExternalStore } from 'react'
import { getHandler } from '../App'
import { Command, type CommandPayload } from '../command'
import type { JSONValue } from '../nodes/node-description'
import {
  type IndexPath,
  isCollapsed,
  type Path,
  type Point,
} from '../selection'
import type { Key } from './key'
import { type ReadonlyState, WritableState } from './state'

export function useStateManager<T extends 'root'>(
  type: T,
  initial: JSONValue<T>,
) {
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

export class StateManager<T extends 'root'> {
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
    return getHandler(rootEntry.type).render(this, rootEntry)
  }

  dispatchCommand<C extends Command>(
    command: C,
    ...payload: CommandPayload<C>
  ): boolean {
    return this.update((state) => {
      if (
        command === Command.AddParagraph ||
        command === Command.AddMultipleChoice
      ) {
        this.update((state) => {
          const newElement: JSONValue<'paragraph' | 'multipleChoice'> =
            command === Command.AddParagraph
              ? { type: 'paragraph', value: '...' }
              : {
                  type: 'multipleChoice',
                  task: [{ type: 'paragraph', value: 'What is 2 + 2?' }],
                  answers: [
                    {
                      type: 'multipleChoiceAnswer',
                      isCorrect: false,
                      answer: '3',
                    },
                    {
                      type: 'multipleChoiceAnswer',
                      isCorrect: true,
                      answer: '4',
                    },
                    {
                      type: 'multipleChoiceAnswer',
                      isCorrect: false,
                      answer: '5',
                    },
                  ],
                }
          const key = getHandler(newElement.type).insert(
            state,
            this.rootKey,
            newElement,
          ).key
          state.update(this.rootKey, (prev) => [...prev, key])
        })
      }
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
