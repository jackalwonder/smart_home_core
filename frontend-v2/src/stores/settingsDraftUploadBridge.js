const uploadRefRegistry = new Map()

function createToken() {
  return `draft-upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function registerDraftUploadFile(file, metadata = {}) {
  const token = createToken()
  const objectUrl = URL.createObjectURL(file)

  uploadRefRegistry.set(token, {
    token,
    file,
    objectUrl,
    fileName: metadata.fileName ?? file.name,
    mimeType: metadata.mimeType ?? file.type,
    fileSize: metadata.fileSize ?? file.size,
    imageWidth: metadata.imageWidth ?? null,
    imageHeight: metadata.imageHeight ?? null,
    createdAt: Date.now(),
  })

  return {
    token,
    objectUrl,
  }
}

export function getDraftUploadRef(token) {
  if (!token) {
    return null
  }
  return uploadRefRegistry.get(token) ?? null
}

export function hasDraftUploadRef(token) {
  return Boolean(getDraftUploadRef(token))
}

export function revokeDraftUploadRef(token) {
  const entry = getDraftUploadRef(token)
  if (entry?.objectUrl) {
    URL.revokeObjectURL(entry.objectUrl)
  }
  uploadRefRegistry.delete(token)
}

export function clearDraftUploadRefs() {
  Array.from(uploadRefRegistry.keys()).forEach(revokeDraftUploadRef)
}
