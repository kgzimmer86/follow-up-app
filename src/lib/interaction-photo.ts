export const interactionPhotoBucket = 'follow-up-interaction-photos'
export const maxInteractionPhotoBytes = 8 * 1024 * 1024

const supportedInteractionPhotoTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
])

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
