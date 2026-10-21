// Downscales a camera photo before upload (phone photos are often 3-8 MB).
export async function compressImage(file, { maxSide = 1280, quality = 0.8 } = {}) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choose an image file')
  const bitmap = await loadImage(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Could not process the photo')
  return blob
}

function loadImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the photo'))
    img.src = URL.createObjectURL(file)
  })
}
