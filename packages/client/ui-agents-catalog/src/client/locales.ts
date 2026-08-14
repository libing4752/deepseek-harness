/** `agentsCatalog` namespace dictionaries (the skills + memory panel copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '技能与记忆',
  'panel.title': '技能与记忆',
  'panel.close': '关闭',
  'panel.back': '返回',
  'group.skills': '技能',
  'group.memory': '记忆',
  'empty': '当前项目没有技能或记忆',
  'empty.noSession': '请先打开一个会话',
  'status.loading': '加载中…',
  'status.error': '加载失败',
  'badge.modelOnly': '仅模型',
  'badge.userOnly': '仅用户',
  'badge.both': '模型/用户',
  'content.empty': '（无内容）',
} satisfies Record<string, string>

/** The agentsCatalog namespace key union. */
export type CatalogKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Skills & memory',
  'panel.title': 'Skills & memory',
  'panel.close': 'Close',
  'panel.back': 'Back',
  'group.skills': 'Skills',
  'group.memory': 'Memory',
  'empty': 'No skills or memory in this project',
  'empty.noSession': 'Open a session first',
  'status.loading': 'Loading…',
  'status.error': 'Load failed',
  'badge.modelOnly': 'model only',
  'badge.userOnly': 'user only',
  'badge.both': 'model/user',
  'content.empty': '(empty)',
} satisfies Record<CatalogKey, string>
