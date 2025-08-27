import { createArrayHandler } from './helper'
import { ParagraphHandler } from './paragraph'
import type { NodeHandler } from './types/node-handler'

export const ContentHandler: NodeHandler<'content'> = createArrayHandler({
  type: 'content',
  childHandler: ParagraphHandler,
})

export const RootHandler: NodeHandler<'root'> = createArrayHandler({
  type: 'root',
  childHandler: ParagraphHandler,
})
