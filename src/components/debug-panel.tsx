import { useId, useState } from 'react'

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
  const [show, setShow] = useState(showOnStartup)

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
              onChange={() =>
                setShow((prev) => ({ ...prev, [option]: !prev[option] }))
              }
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
              {getCurrentValue[option]()}
            </pre>
          ) : null,
        )}
      </div>
    </>
  )
}
