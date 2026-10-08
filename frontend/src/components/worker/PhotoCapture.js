import { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  })
}

export default function PhotoCapture({ type, label, hint, existingImage, maxSizeMB = 8, isUploading = false, onUpload, onUploaded }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxSize: maxSizeMB * 1024 * 1024,
    multiple: false,
    onDropAccepted: (files) => setFile(files[0]),
    onDropRejected: (rejections) => {
      if (rejections[0]?.errors?.some(e => e.code === 'file-too-large')) {
        toast.error(`Image must be under ${maxSizeMB}MB`)
      } else {
        toast.error('Only JPEG, PNG or WebP images are allowed')
      }
    },
  })

  const showImage = preview || existingImage
  const uploading = isUploading

  const handleUpload = async () => {
    if (!file) return
    const pos = await getPosition()
    const formData = new FormData()
    formData.append('image', file)
    formData.append('type', type)
    if (pos) {
      formData.append('lat', String(pos.lat))
      formData.append('lng', String(pos.lng))
    }
    try {
      await onUpload(formData)
      setFile(null)
      setPreview(null)
      if (onUploaded) onUploaded()
    } catch {
      toast.error('Upload failed — please retry')
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          📸 {label}
        </div>
        {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
      </div>

      {showImage ? (
        <div className="p-3">
          <img src={showImage} alt={label} className="w-full h-44 object-cover rounded-lg border border-slate-100" />
          <button
            type="button"
            onClick={() => { setFile(null); setPreview(null) }}
            className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium"
          >
            ⌫ Replace photo
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`m-3 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/40'
          }`}
        >
          <input {...getInputProps()} />
          <div className="text-3xl mb-2">📷</div>
          <div className="text-sm font-medium text-slate-600">
            {isDragActive ? 'Drop the photo here' : 'Tap to capture or upload'}
          </div>
          <div className="text-xs text-slate-400 mt-1">JPEG · PNG · WebP · up to {maxSizeMB}MB</div>
        </div>
      )}

      {preview && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="w-full btn-primary btn-sm"
          >
            {uploading ? 'Uploading…' : `Upload ${type === 'before' ? 'BEFORE' : 'AFTER'} evidence`}
          </button>
        </div>
      )}
    </div>
  )
}