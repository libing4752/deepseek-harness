/** `gitWorkspace` namespace dictionaries (the workspace-changes panel copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '改动',
  'panel.title': '工作区改动',
  'panel.close': '关闭',
  'panel.empty': '工作区干净，没有未提交改动',
  'panel.notGit': '当前目录不是 git 仓库',
  'panel.noSession': '请先打开一个会话',
  'status.loading': '加载中…',
  'status.error': '加载失败',
  'summary': '{n} 个文件',
  'action.revert': '回退',
  'action.revertAll': '全部回退',
  'action.revertAllConfirm': '确定回退全部改动？此操作不可撤销。',
  'action.cancel': '取消',
  'action.confirm': '回退',
  'action.selectHint': '选择左侧文件查看改动',
  'badge.added': '新增',
  'badge.modified': '修改',
  'badge.deleted': '删除',
  'badge.untracked': '未跟踪',
} satisfies Record<string, string>

/** The gitWorkspace namespace key union. */
export type GitWorkspaceKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Changes',
  'panel.title': 'Workspace changes',
  'panel.close': 'Close',
  'panel.empty': 'Working tree is clean',
  'panel.notGit': 'Not a git repository',
  'panel.noSession': 'Open a session first',
  'status.loading': 'Loading…',
  'status.error': 'Load failed',
  'summary': '{n} files',
  'action.revert': 'Revert',
  'action.revertAll': 'Revert all',
  'action.revertAllConfirm': 'Revert all changes? This cannot be undone.',
  'action.cancel': 'Cancel',
  'action.confirm': 'Revert',
  'action.selectHint': 'Select a file to see its change',
  'badge.added': 'added',
  'badge.modified': 'modified',
  'badge.deleted': 'deleted',
  'badge.untracked': 'untracked',
} satisfies Record<GitWorkspaceKey, string>
