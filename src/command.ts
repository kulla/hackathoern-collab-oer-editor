export enum Command {
  InsertText = 'insertText',
  InsertNewElement = 'insertNewElement',
  DeleteRange = 'deleteRange',
  DeleteForward = 'deleteForward',
  DeleteBackward = 'deleteBackward',
  AddMultipleChoice = 'addMultipleChoice',
  AddParagraph = 'addParagraph',
}

export type CommandPayload<O extends Command> = O extends Command.InsertText
  ? [string]
  : []
