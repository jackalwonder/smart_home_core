import { getDraftUploadRef } from './settingsDraftUploadBridge'

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

function buildFloorplanUploadFormData(floorplanUpload, uploadRef) {
  if (!uploadRef?.file) {
    return null
  }

  const formData = new FormData()
  formData.append('zone_id', String(floorplanUpload.zoneId))
  formData.append('image_width', String(floorplanUpload.assetMeta?.imageWidth))
  formData.append('image_height', String(floorplanUpload.assetMeta?.imageHeight))
  formData.append('preserve_existing', 'true')
  formData.append(
    'file',
    uploadRef.file,
    floorplanUpload.assetMeta?.fileName || uploadRef.fileName || 'floorplan-upload',
  )
  return formData
}

export function buildFloorplanUploadRequest(floorplanUpload = {}, context = {}) {
  const stepKey = normalizeString(context.stepKey, 'floorplan_upload')
  const zoneId = normalizeNullableNumber(floorplanUpload.zoneId)
  const sourceType = normalizeString(floorplanUpload.assetMeta?.sourceType, '')
  const imageWidth = normalizeNullableNumber(floorplanUpload.assetMeta?.imageWidth)
  const imageHeight = normalizeNullableNumber(floorplanUpload.assetMeta?.imageHeight)
  const fileRefToken = normalizeString(floorplanUpload.fileRefToken, '')
  const uploadRef = fileRefToken ? getDraftUploadRef(fileRefToken) : null
  const endpoint = '/api/spatial/floorplan'
  const errors = []

  if (!Number.isFinite(zoneId)) {
    errors.push(
      buildBaseError(
        'floorplan_upload_missing_zone_id',
        '缺少 zoneId，无法准备 floorplan 上传请求。',
        stepKey,
        floorplanUpload,
      ),
    )
  }

  if (sourceType !== 'upload') {
    errors.push(
      buildBaseError(
        'floorplan_upload_requires_upload_asset',
        '当前草稿底图不是上传型素材，无法构建 floorplan multipart 请求。',
        stepKey,
        floorplanUpload,
      ),
    )
  }

  if (!fileRefToken) {
    errors.push(
      buildBaseError(
        'floorplan_upload_missing_file_ref',
        '当前草稿底图缺少 fileRefToken，无法定位待上传文件。',
        stepKey,
        floorplanUpload,
      ),
    )
  } else if (!uploadRef?.file) {
    errors.push(
      buildBaseError(
        'floorplan_upload_ref_unavailable',
        '当前草稿底图的 fileRefToken 仍存在，但原始文件桥接已失效，需要重新选择文件。',
        stepKey,
        floorplanUpload,
      ),
    )
  }

  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) {
    errors.push(
      buildBaseError(
        'floorplan_upload_missing_dimensions',
        '当前草稿底图缺少 imageWidth / imageHeight，无法准备上传请求。',
        stepKey,
        floorplanUpload,
      ),
    )
  }

  return {
    ok: errors.length === 0,
    endpoint,
    method: 'POST',
    body: errors.length === 0 ? buildFloorplanUploadFormData(floorplanUpload, uploadRef) : null,
    fileRefToken: fileRefToken || null,
    uploadRef: uploadRef
      ? {
          token: uploadRef.token,
          fileName: uploadRef.fileName ?? null,
          mimeType: uploadRef.mimeType ?? null,
          fileSize: normalizeNullableNumber(uploadRef.fileSize),
          imageWidth: normalizeNullableNumber(uploadRef.imageWidth),
          imageHeight: normalizeNullableNumber(uploadRef.imageHeight),
        }
      : null,
    meta: {
      zoneId,
      fileName: normalizeString(floorplanUpload.assetMeta?.fileName, uploadRef?.fileName ?? ''),
      mimeType: normalizeString(floorplanUpload.assetMeta?.mimeType, uploadRef?.mimeType ?? ''),
      fileSize:
        normalizeNullableNumber(floorplanUpload.assetMeta?.fileSize)
        ?? normalizeNullableNumber(uploadRef?.fileSize),
      imageWidth,
      imageHeight,
      preserveExisting: true,
    },
    errors,
  }
}

export function normalizeFloorplanUploadResponse(rawResponse = {}, context = {}) {
  const stepKey = normalizeString(context.stepKey, 'floorplan_upload')
  const request = context.request ?? null

  return {
    stepKey,
    outcome: 'success',
    message: 'floorplan upload 请求已完成并返回响应。',
    payload: {
      zone_id: normalizeNullableNumber(rawResponse.zone_id)
        ?? normalizeNullableNumber(rawResponse.zone?.id)
        ?? normalizeNullableNumber(request?.meta?.zoneId),
      image_url: normalizeString(rawResponse.image_url, request?.imagePath ?? ''),
      image_width: normalizeNullableNumber(rawResponse.image_width)
        ?? normalizeNullableNumber(rawResponse.zone?.floor_plan_image_width)
        ?? normalizeNullableNumber(request?.meta?.imageWidth),
      image_height: normalizeNullableNumber(rawResponse.image_height)
        ?? normalizeNullableNumber(rawResponse.zone?.floor_plan_image_height)
        ?? normalizeNullableNumber(request?.meta?.imageHeight),
      file_name: normalizeString(rawResponse.file_name, request?.meta?.fileName ?? ''),
    },
    raw: rawResponse,
  }
}

export function normalizeFloorplanUploadError(rawError = null, context = {}) {
  const stepKey = normalizeString(context.stepKey, 'floorplan_upload')

  if (rawError?.code && rawError?.message) {
    return {
      code: rawError.code,
      message: rawError.message,
      retryable: Boolean(rawError.retryable),
      stepKey,
      raw: rawError.raw ?? rawError,
    }
  }

  const status = normalizeNullableNumber(rawError?.status)
  const retryable = status == null || status === 408 || status >= 500

  return buildBaseError(
    'floorplan_upload_request_failed',
    rawError?.message || 'floorplan upload 请求准备或执行失败。',
    stepKey,
    rawError,
    retryable,
  )
}

export function buildFloorplanUploadExecutorAdapterPreview(submitPlan, context = {}) {
  const stepKey = normalizeString(context.stepKey, 'floorplan_upload')
  const uploadStep = submitPlan?.floorplanUpload ?? null
  const request = buildFloorplanUploadRequest(uploadStep, { ...context, stepKey })

  return {
    stepKey,
    stepType: 'floorplan_upload',
    endpointPattern: '/api/spatial/floorplan',
    requestShape: {
      endpoint: 'string',
      method: 'POST',
      body: 'FormData | null',
      fileRefToken: 'string | null',
      meta: {
        zoneId: 'number | null',
        fileName: 'string | null',
        mimeType: 'string | null',
        fileSize: 'number | null',
        imageWidth: 'number | null',
        imageHeight: 'number | null',
      },
    },
    responseShape: {
      stepKey: 'string',
      outcome: 'success',
      message: 'string',
      payload: {
        zone_id: 'number | null',
        image_url: 'string | null',
        image_width: 'number | null',
        image_height: 'number | null',
        file_name: 'string | null',
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
    requestPreview: {
      endpoint: request.endpoint,
      method: request.method,
      body: request.body,
      fileRefToken: request.fileRefToken,
      meta: request.meta,
    },
    requestReady: request.ok && uploadStep?.status === 'ready',
    errors: request.errors,
    stepStatus: uploadStep?.status ?? 'noop',
  }
}

export function buildFloorplanUploadExecutionAdapterBundle(submitPlan, context = {}) {
  const stepKey = normalizeString(context.stepKey, 'floorplan_upload')
  const preview = buildFloorplanUploadExecutorAdapterPreview(submitPlan, { ...context, stepKey })
  const firstError = preview.errors[0] ?? null

  return {
    stepKey,
    stepType: 'floorplan_upload',
    endpoint: preview.requestPreview.endpoint,
    count: preview.stepStatus === 'noop' ? 0 : 1,
    requestReady: preview.requestReady,
    preview,
    requestPreview: preview.requestReady ? preview.requestPreview : null,
    successMapping: preview.requestReady
      ? normalizeFloorplanUploadResponse({}, {
          stepKey,
          request: {
            meta: preview.requestPreview.meta,
            imagePath: submitPlan?.floorplanUpload?.imagePath ?? null,
          },
        })
      : null,
    normalizedError: firstError
      ? normalizeFloorplanUploadError(firstError, { stepKey })
      : null,
  }
}
