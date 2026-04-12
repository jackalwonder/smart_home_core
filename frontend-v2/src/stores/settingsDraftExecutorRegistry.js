const executorRegistry = new Map()

export function registerExecutor(key, executor) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('executor key is required')
  }
  if (!executor || typeof executor.run !== 'function') {
    throw new Error(`executor "${key}" must provide a run() function`)
  }

  executorRegistry.set(key.trim(), executor)
  return executor
}

export function getExecutor(key) {
  if (typeof key !== 'string' || !key.trim()) {
    return null
  }
  return executorRegistry.get(key.trim()) ?? null
}

export function hasExecutor(key) {
  if (typeof key !== 'string' || !key.trim()) {
    return false
  }
  return executorRegistry.has(key.trim())
}

export function clearExecutors() {
  executorRegistry.clear()
}
