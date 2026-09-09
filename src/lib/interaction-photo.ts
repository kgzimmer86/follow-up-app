import type { SupabaseClient } from '@supabase/supabase-js'

export const interactionPhotoBucket = 'follow-up-interaction-photos'
export const maxInteractionPhotoBytes = 8 * 1024 * 1024

const supportedInteractionPhotoTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
])

export type PhotoCleanupResult = 'removed' | 'in_use' | 'pending'

function isInteractionPhotoPath(path: unknown): path is string {
  return typeof path === 'string' && /^interaction-attachments\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|heic|heif)$/i.test(path)
}

export async function removeUnusedInteractionPhoto(client: SupabaseClient, path: string, checkOnly = false): Promise<PhotoCleanupResult> {
  if (!isInteractionPhotoPath(path)) return 'pending'
  try {
    // A save response can be lost after the interaction was committed. Never
    // remove its photo just because the browser received an error.
    const { data: references, error: referenceError } = await client.from('follow_up_events')
      .select('id').eq('attachment_path', path).limit(1)
    if (referenceError || references === null) return 'pending'
    if (references.length > 0) return 'in_use'
    // With an uncertain save response, the write might still be finishing.
    // Defer removal to an explicit retry rather than racing that save.
    if (checkOnly) return 'pending'

    const bucket = client.storage.from(interactionPhotoBucket)
    const { data, error } = await bucket.remove([path])
    if (error) return 'pending'
    if (data?.some((object) => object.name === path)) return 'removed'

    // An empty removal response is not proof of deletion (for example, RLS
    // may have denied it). It can also mean an earlier attempt already worked.
    const slash = path.lastIndexOf('/')
    const name = path.slice(slash + 1)
    const { data: remaining, error: listError } = await bucket.list(path.slice(0, slash), { search: name, limit: 100 })
    if (listError || remaining === null || remaining.some((object) => object.name === name)) return 'pending'
    return 'removed'
  } catch {
    return 'pending'
  }
}

export function createPhotoCleanupQueue(userId: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {
  const key = `follow-up-photo-cleanup-${userId}`
  let paths: string[] = []
  try {
    const stored: unknown = JSON.parse(storage?.getItem(key) ?? '[]')
    if (Array.isArray(stored)) paths = [...new Set(stored.filter(isInteractionPhotoPath))]
  } catch { /* Keep an in-memory queue if storage is unavailable. */ }
  const listeners = new Set<() => void>()
  function update(next: string[]) {
    paths = next
    try {
      if (paths.length) storage?.setItem(key, JSON.stringify(paths))
      else storage?.removeItem(key)
    } catch { /* Retain retry options for the current app session. */ }
    for (const listener of listeners) listener()
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => paths,
    add(path: string) { if (isInteractionPhotoPath(path) && !paths.includes(path)) update([...paths, path]) },
    remove(path: string) { update(paths.filter((item) => item !== path)) },
  }
}

function interactionPhotoMimeType(file: Pick<File, 'type' | 'name'>) {
  const declaredType = file.type.toLowerCase()

  if (supportedInteractionPhotoTypes.has(declaredType)) {
    return declaredType
  }

  const extension = file.name.toLowerCase().split('.').pop()

  return extension === 'jpg' || extension === 'jpeg'
    ? 'image/jpeg'
    : extension === 'png'
      ? 'image/png'
      : extension === 'heic'
        ? 'image/heic'
        : extension === 'heif'
          ? 'image/heif'
          : declaredType
}

export function validateInteractionPhoto(file: Pick<File, 'type' | 'size' | 'name'>) {
  if (!supportedInteractionPhotoTypes.has(interactionPhotoMimeType(file))) {
    return 'Choose a JPEG, PNG, or HEIC photo.'
  }

  if (file.size > maxInteractionPhotoBytes) {
    return 'Keep the photo under 8 MB.'
  }

  return null
}

export async function prepareInteractionPhoto(file: File) {
  const validationError = validateInteractionPhoto(file)

  if (validationError) {
    throw new Error(validationError)
  }

  const originalType = interactionPhotoMimeType(file)

  // HEIC support varies by browser. Keep these files intact so an iPhone
  // photo is still saved even when the browser cannot decode it for resizing.
  if (originalType === 'image/heic' || originalType === 'image/heif') {
    return {
      blob: file as Blob,
      contentType: originalType,
      extension: originalType === 'image/heif' ? 'heif' : 'heic',
    }
  }

  try {
    const bitmap = await createImageBitmap(file)
    const maxDimension = 2200
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height)
    )

    if (scale === 1 && file.size <= 4 * 1024 * 1024) {
      bitmap.close()
      return {
        blob: file as Blob,
        contentType: originalType,
        extension: originalType === 'image/png' ? 'png' : 'jpg',
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')

    if (!context) {
      bitmap.close()
      return {
        blob: file as Blob,
        contentType: originalType,
        extension: originalType === 'image/png' ? 'png' : 'jpg',
      }
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const compressed = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.84)
    })

    if (!compressed || compressed.size > maxInteractionPhotoBytes) {
      return {
        blob: file as Blob,
        contentType: originalType,
        extension: originalType === 'image/png' ? 'png' : 'jpg',
      }
    }

    return {
      blob: compressed,
      contentType: 'image/jpeg',
      extension: 'jpg',
    }
  } catch {
    return {
      blob: file as Blob,
      contentType: originalType,
      extension: originalType === 'image/png' ? 'png' : 'jpg',
    }
  }
}
