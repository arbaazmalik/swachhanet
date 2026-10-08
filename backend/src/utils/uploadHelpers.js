const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { ImageKit } = require('@imagekit/nodejs');
const logger = require('../utils/logger');

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);

const MAX_EVIDENCE_SIZE = 8 * 1024 * 1024; // 8MB

/**
 * Shared screenshot/evidence upload (mirrors the complaints upload storage
 * architecture: ImageKit when configured, local uploads/ otherwise).
 */
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only JPEG, PNG and WebP images are permitted.'), { code: 'INVALID_FILE_TYPE' }));
    }
  },
});

const imagekit = (process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT)
  ? new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    })
  : null;

async function uploadToStorage(buffer, mimetype, subdir = 'evidence') {
  const uploadsDir = path.resolve(__dirname, `../../uploads/${subdir}`);
  fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `${uuidv4()}.jpg`;
  const outPath = path.join(uploadsDir, filename);

  if (imagekit) {
    try {
      const uploadRes = await imagekit.files.upload({
        file: buffer.toString('base64'),
        fileName: filename,
        folder: process.env.IMAGEKIT_FOLDER || `/swachhanet/${subdir}`,
        useUniqueFileName: false,
        tags: [`${subdir}-image`],
      });
      return uploadRes.url;
    } catch (err) {
      logger.warn(`ImageKit upload failed, falling back to local storage: ${err.message}`);
    }
  }

  fs.writeFileSync(outPath, buffer);
  return `/uploads/${subdir}/${filename}`;
}

module.exports = { evidenceUpload, uploadToStorage, ALLOWED_IMAGE_MIME, MAX_EVIDENCE_SIZE };