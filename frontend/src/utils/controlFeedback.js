export const CONTROL_FEEDBACK_PRESENTATION = {
  offline: {
    label: '离线',
    badgeClass: 'shell-status shell-status--offline',
    surfaceClass: 'shell-state-surface shell-state-surface--offline',
    dotColor: '#94a3b8',
    accentColor: '#94a3b8',
    subtleColor: 'rgba(148,163,184,0.24)',
  },
  pending: {
    label: '指令发送中',
    badgeClass: 'shell-status shell-status--pending',
    surfaceClass: 'shell-state-surface shell-state-surface--pending',
    dotColor: '#f59e0b',
    accentColor: '#f59e0b',
    subtleColor: 'rgba(245,158,11,0.22)',
  },
  success: {
    label: '已同步',
    badgeClass: 'shell-status shell-status--success',
    surfaceClass: 'shell-state-surface shell-state-surface--success',
    dotColor: '#22c55e',
    accentColor: '#22c55e',
    subtleColor: 'rgba(34,197,94,0.18)',
  },
  error: {
    label: '执行失败',
    badgeClass: 'shell-status shell-status--error',
    surfaceClass: 'shell-state-surface shell-state-surface--error',
    dotColor: '#ef4444',
    accentColor: '#ef4444',
    subtleColor: 'rgba(239,68,68,0.18)',
  },
  active: {
    label: '活跃',
    badgeClass: 'shell-status shell-status--active',
    surfaceClass: 'shell-state-surface shell-state-surface--active',
    dotColor: '#2d6660',
    accentColor: '#2d6660',
    subtleColor: 'rgba(45,102,96,0.18)',
  },
  idle: {
    label: '待命',
    badgeClass: 'shell-status shell-status--idle',
    surfaceClass: 'shell-state-surface shell-state-surface--idle',
    dotColor: '#cbd5e1',
    accentColor: '#94a3b8',
    subtleColor: 'rgba(148,163,184,0.14)',
  },
}

export function resolveControlFeedbackTone({ feedbackState = 'idle', offline = false, active = false } = {}) {
  if (offline) return 'offline'
  if (feedbackState === 'pending') return 'pending'
  if (feedbackState === 'success') return 'success'
  if (feedbackState === 'error') return 'error'
  if (active) return 'active'
  return 'idle'
}

export function getControlFeedbackPresentation(input = {}) {
  const tone = typeof input === 'string' ? input : resolveControlFeedbackTone(input)
  return {
    tone,
    ...(CONTROL_FEEDBACK_PRESENTATION[tone] ?? CONTROL_FEEDBACK_PRESENTATION.idle),
  }
}
