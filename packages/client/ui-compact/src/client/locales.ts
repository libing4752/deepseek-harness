/** `compact` namespace dictionaries (the composer compression control's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'button.aria': '压缩上下文',
  'button.title': '压缩上下文（/compact）',
  'menu.compress': '压缩上下文',
  'menu.skill': '压缩并保存为 skill',
  'menu.memory': '压缩并保存为 memory',
  'dialog.skillTitle': '压缩并保存为 skill',
  'dialog.memoryTitle': '压缩并保存为 memory',
  'dialog.skillPlaceholder': 'skill 名称（小写 kebab-case）',
  'dialog.memoryPlaceholder': 'memory 标题',
  'dialog.cancel': '取消',
  'dialog.confirm': '确认',
  'dialog.close': '关闭',
} satisfies Record<string, string>

/** The compact namespace key union. */
export type CompactKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'button.aria': 'Compress context',
  'button.title': 'Compress context (/compact)',
  'menu.compress': 'Compress context',
  'menu.skill': 'Compress and save as skill',
  'menu.memory': 'Compress and save as memory',
  'dialog.skillTitle': 'Compress and save as skill',
  'dialog.memoryTitle': 'Compress and save as memory',
  'dialog.skillPlaceholder': 'Skill name (lowercase kebab-case)',
  'dialog.memoryPlaceholder': 'Memory title',
  'dialog.cancel': 'Cancel',
  'dialog.confirm': 'Confirm',
  'dialog.close': 'Close',
} satisfies Record<CompactKey, string>
