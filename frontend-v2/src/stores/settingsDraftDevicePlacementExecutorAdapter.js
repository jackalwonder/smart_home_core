function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed || fallback
}

function normalizeNullableNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function buildBaseError(code, message, stepKey, raw = null, retryable = false) {
  return {
    code,
    message,
    retryable,
    stepKey,
    raw,
  }
}

export function buildDevicePlacementRequest(stepItem = {}, context = {}) {
  const stepKey = normalizeString(context.stepKey, 'device_placement_save')
  const deviceId = normalizeNullableNumber(stepItem.mappedDeviceId)
  const roomId = normalizeNullableNumber(stepItem.mappedRoomId)
  const payload = stepItem?.payload ?? {}

  const normalizedPayload = {
    device_id: deviceId,
    room_id: roomId,
    plan_x: normalizeNullableNumber(payload.plan_x),
    plan_y: normalizeNullableNumber(payload.plan_y),
    plan_z: normalizeNullableNumber(payload.plan_z),
    plan_rotation: normalizeNullableNumber(payload.plan_rotation) ?? 0,
  }

  const errors = []

  if (!Number.isFinite(normalizedPayload.device_id)) {
    errors.push(buildBaseError('missing_device_id', '缺少后端 device_id，无法准备 device placement 请求。', stepKey, stepItem))
  }

  if (normalizedPayload.plan_x == null || normalizedPayload.plan_y == null) {
    errors.push(buildBaseError('missing_plan_coordinates', '缺少 plan_x 或 plan_y，无法准备 device placement 请求。', stepKey, stepItem))
  }

  return {
    ok: errors.length === 0,
    endpoint: Number.isFinite(normalizedPayload.device_id)
      ? `/api/spatial/devices/${normalizedPayload.device_id}/placement`
      : '/api/spatial/devices/{device_id}/placement',
    method: 'PUT',
    payload: normalizedPayload,
    pathParams: {
      device_id: normalizedPayload.device_id,
    },
    body: {
      plan_x: normalizedPayload.plan_x,
      plan_y: normalizedPayload.plan_y,
      plan_z: normalizedPayload.plan_z,
      plan_rotation: normalizedPayload.plan_rotation,
    },
    requiredFields: ['device_id', 'plan_x', 'plan_y'],
    optionalFields: ['room_id', 'plan_z', 'plan_rotation'],
    errors,
  }
}

export function normalizeDevicePlacementResponse(rawResponse = {}, context = {}) {
  const stepKey = normalizeString(context.stepKey, 'device_placement_save')
  const request = context.request ?? null

  return {
    stepKey,
    hotspotId: request?.hotspotId ?? null,
    outcome: 'success',
    message: 'device placement 请求已完成并返回响应。',
    payload: {
      device_id: normalizeNullableNumber(rawResponse.device_id) ?? request?.payload?.device_id ?? null,
      room_id: normalizeNullableNumber(rawResponse.room_id) ?? request?.payload?.room_id ?? null,
      plan_x: normalizeNullableNumber(rawResponse.plan_x) ?? request?.payload?.plan_x ?? null,
      plan_y: normalizeNullableNumber(rawResponse.plan_y) ?? request?.payload?.plan_y ?? null,
      plan_z: normalizeNullableNumber(rawResponse.plan_z) ?? request?.payload?.plan_z ?? null,
      plan_rotation: normalizeNullableNumber(rawResponse.plan_rotation) ?? request?.payload?.plan_rotation ?? 0,
    },
    raw: rawResponse,
  }
}

export function normalizeDevicePlacementError(rawError = null, context = {}) {
  const stepKey = normalizeString(context.stepKey, 'device_placement_save')

  if (rawError?.code && rawError?.message) {
    return {
      code: rawError.code,
      message: rawError.message,
      retryable: Boolean(rawError.retryable),
      stepKey,
      raw: rawError.raw ?? rawError,
    }
  }

  return buildBaseError(
    'device_placement_request_failed',
    rawError?.message || 'device placement 请求准备或执行失败。',
    stepKey,
    rawError,
    false,
  )
}

export function buildDevicePlacementExecutorAdapterPreview(submitPlan, context = {}) {
  const placementStep = Array.isArray(submitPlan?.steps)
    ? submitPlan.steps.find((step) => step.type === 'device_placement_save') ?? null
    : null
  const placementItems = Array.isArray(submitPlan?.devicePlacements) ? submitPlan.devicePlacements : []
  const activeItems = placementItems.filter((item) => item.status === 'ready' || item.status === 'noop' || item.status === 'blocked')

  const requests = activeItems.map((item, index) => {
    const stepKey = `${normalizeString(placementStep?.type, 'device_placement_save')}:${item.hotspotId ?? index}`
    const request = buildDevicePlacementRequest(item, { ...context, stepKey })

    return {
      stepKey,
      hotspotId: item.hotspotId ?? null,
      label: item.label ?? item.draftDeviceId ?? stepKey,
      status: item.status ?? 'blocked',
      roomAlignment: item.roomAlignment ?? 'missing',
      endpoint: request.endpoint,
      method: request.method,
      payload: request.payload,
      body: request.body,
      pathParams: request.pathParams,
      requestReady: request.ok && item.status === 'ready',
      errors: request.errors,
    }
  })

  return {
    stepType: 'device_placement_save',
    endpointPattern: '/api/spatial/devices/{device_id}/placement',
    requestShape: {
      device_id: 'number',
      room_id: 'number | null',
      plan_x: 'number',
      plan_y: 'number',
      plan_z: 'number | null',
      plan_rotation: 'number',
    },
    responseShape: {
      stepKey: 'string',
      outcome: 'success',
      message: 'string',
      payload: {
        device_id: 'number | null',
        room_id: 'number | null',
        plan_x: 'number | null',
        plan_y: 'number | null',
        plan_z: 'number | null',
        plan_rotation: 'number',
      },
      raw: 'unknown',
    },
    errorShape: {
      code: 'string',
      message: 'string',
      retryable: 'boolean',
      stepKey: 'string',
      raw: 'unknown',
    },
    requests,
    readyCount: requests.filter((item) => item.requestReady).length,
    blockedCount: requests.filter((item) => !item.requestReady).length,
    stepStatus: placementStep?.status ?? 'noop',
  }
}

export function buildDevicePlacementExecutionAdapterBundle(submitPlan, context = {}) {
  const preview = buildDevicePlacementExecutorAdapterPreview(submitPlan, context)
  const readyRequests = preview.requests.filter((item) => item.requestReady)
  const blockedRequests = preview.requests.filter((item) => !item.requestReady)
  const firstBlockedError = blockedRequests.flatMap((item) => item.errors || [])[0] ?? null
  const firstReadyRequest = readyRequests[0] ?? null
  const stepKey = normalizeString(context.stepKey, 'device_placement_save')

  return {
    stepKey,
    stepType: 'device_placement_save',
    endpoint: firstReadyRequest?.endpoint ?? preview.endpointPattern,
    count: readyRequests.length,
    requestReady: readyRequests.length > 0,
    preview,
    requestPreview: firstReadyRequest
      ? {
          endpoint: firstReadyRequest.endpoint,
          method: firstReadyRequest.method,
          payload: firstReadyRequest.payload,
          body: firstReadyRequest.body,
          pathParams: firstReadyRequest.pathParams,
        }
      : null,
    successMapping: firstReadyRequest
      ? normalizeDevicePlacementResponse({}, {
          stepKey,
          request: {
            hotspotId: firstReadyRequest.hotspotId,
            payload: firstReadyRequest.payload,
          },
        })
      : null,
    normalizedError: firstBlockedError
      ? normalizeDevicePlacementError(firstBlockedError, { stepKey })
      : null,
  }
}
