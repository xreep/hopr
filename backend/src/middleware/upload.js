import multer from 'multer'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

// Checks the file's leading bytes so a renamed non-image cannot slip through
export function sniffImageType(buffer) {
  if (!buffer || buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 2, fields: 5, fieldSize: 2048 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      const err = new Error('Only JPEG, PNG or WebP images are allowed')
      err.status = 400
      return cb(err)
    }
    cb(null, true)
  }
})

// Proof of delivery: optional "photo" and "signature" images
export const proofUpload = (req, res, next) => {
  uploader.fields([{ name: 'photo', maxCount: 1 }, { name: 'signature', maxCount: 1 }])(req, res, err => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Each image must be 5 MB or smaller' })
    if (err instanceof multer.MulterError) return res.status(400).json({ message: `Upload error: ${err.message}` })
    return res.status(err.status || 400).json({ message: err.message })
  })
}
