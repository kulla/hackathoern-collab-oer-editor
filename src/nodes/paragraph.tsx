import { createWrappedHandler } from './helper'
import { TextHandler } from './text'
import type { NodeHandler } from './types/node-handler'

export const ParagraphHandler: NodeHandler<'paragraph'> = {
  ...createWrappedHandler<{ type: 'paragraph'; childType: 'text' }>({
    type: 'paragraph',
    childHandler: TextHandler,
  }),
  render(manager, { key, value }) {
    return (
      <p id={key} key={key} data-key={key}>
        {TextHandler.render(manager, manager.state.getEntry(value))}
      </p>
    )
  },
}
