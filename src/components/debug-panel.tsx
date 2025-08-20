import { useCallback, useId, useReducer } from 'react'

export interface DebugPanelProps<T extends string> {
  labels: Record<T, string>
  getCurrentValue: Record<T, () => string>
  showOnStartup: Record<T, boolean>
}

/**
 * A debug panel component that allows toggling the visibility of various debug information.
 */
export function DebugPanel<T extends string>({
  labels,
  getCurrentValue,
  showOnStartup,
}: DebugPanelProps<T>) {
  const panelId = useId()
  const [show, toggleOption] = useReducer(
    (prev, key: T) => ({ ...prev, [key]: !prev[key] }),
    showOnStartup,
  )
  const getDebugValue = useCallback(
    (option: T) => {
      try {
        return getCurrentValue[option]()
      } catch (error) {
        return `Error retrieving value for "${labels[option]}": ${error}`
      }
    },
    [getCurrentValue, labels],
  )
  const options = Object.keys(labels) as T[]

  return (
    <>
      <h2 id={`${panelId}-header`}>Debug Panel</h2>
      <fieldset className="fieldset" aria-labelledby={`${panelId}-header`}>
        <legend className="fieldset-legend">Options</legend>
        {options.map((option) => (
          <label
            key={option}
            className="label"
            htmlFor={`${panelId}-${option}-toggle`}
          >
            <input
              id={`${panelId}-${option}-toggle`}
              type="checkbox"
              className="toggle"
              checked={show[option]}
              aria-checked={show[option]}
              onChange={() => toggleOption(option)}
            />{' '}
            {labels[option]}
          </label>
        ))}
      </fieldset>
      <div className="flex gap-4">
        {options.map((option) =>
          show[option] ? (
            <pre
              key={option}
              className="max-w-xl h-132"
              role="log"
              aria-label={`Debug info for ${labels[option]}`}
              aria-live="off"
            >
              {getDebugValue(option)}
            </pre>
          ) : null,
        )}
      </div>
    </>
  )
}
