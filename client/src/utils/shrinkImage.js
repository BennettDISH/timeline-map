// Shrinks a picture in the browser before it is uploaded: a PNG or JPEG becomes a WebP at 0.85,
// longest side at most 4096 px (map art keeps room to zoom). A 3 MB PNG map comes out near
// 400 KB, which keeps the upload quick and the bucket small without an image library on the
// server. It only ever returns a better file: the original goes up instead when it is a GIF
// (may be animated) or already a WebP, when the browser cannot read or encode it, or when the
// WebP is not clearly smaller. It never throws; the server still sniffs and checks what arrives.
export const MAX_SIDE = 4096
export const QUALITY = 0.85
export const MIN_SAVING = 0.9 // keep the WebP only when it is under 90% of the original

const CONVERTIBLE = ['image/png', 'image/jpeg']

/** The size that fits `max` on its longest side, never enlarged. */
export function fitWithin(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** The file name with a .webp extension (kept for the Archive: the name a DM sees is theirs). */
export const webpName = (name) => String(name || 'image').replace(/\.[A-Za-z0-9]+$/, '') + '.webp'

const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))

/** The file to upload for `file`: a smaller WebP of it, or `file` itself. */
export async function shrinkImage(file) {
  try {
    if (!file || !CONVERTIBLE.includes(file.type)) return file
    const bitmap = await createImageBitmap(file) // upright, whatever the camera's orientation tag says
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await toBlob(canvas, 'image/webp')
    // a browser that cannot encode WebP hands back a PNG: keep the original then
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size * MIN_SAVING) return file
    return new File([blob], webpName(file.name), { type: 'image/webp', lastModified: file.lastModified })
  } catch {
    return file
  }
}
