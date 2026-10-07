import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { complaintsAPI, aiAPI } from '../../utils/api'
import CitizenLayout from '../../components/shared/CitizenLayout'

const ISSUE_TYPES = [
  { value: 'full_dustbin',      label: 'Full Dustbin',       emoji: '🗑️', desc: 'Dustbin is overflowing' },
  { value: 'illegal_dumping',   label: 'Illegal Dumping',    emoji: '⚠️', desc: 'Waste dumped illegally' },
  { value: 'burning_waste',     label: 'Burning Waste',      emoji: '🔥', desc: 'Waste being burnt' },
  { value: 'missed_collection', label: 'Missed Collection',  emoji: '🚛', desc: 'Truck did not collect' },
  { value: 'overflowing_bin',   label: 'Overflowing Bin',    emoji: '💧', desc: 'Bin is overflowing' },
  { value: 'stray_animal_waste',label: 'Stray Animal Waste', emoji: '🐄', desc: 'Animal waste on road' },
  { value: 'other',             label: 'Other Issue',        emoji: '📍', desc: 'Other waste problem' },
]

export default function ReportPage() {
  const router = useRouter()
  const [step,    setStep]    = useState(1)
  const [form,    setForm]    = useState({ issue_type: '', description: '' })
  const [image,   setImage]   = useState(null)
  const [preview, setPreview] = useState(null)
  const [location, setLocation] = useState(null)
  const [aiResult, setAiResult] = useState(null)
  const [classifying, setClassifying] = useState(false)
  const [geoLoading,  setGeoLoading]  = useState(false)
  const [submitting,  setSubmitting]  = useState(false)

  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  const handleImageSelect = async (file) => {
    setImage(file)
    setPreview(URL.createObjectURL(file))
    setClassifying(true)
    setAiResult(null)
    try {
      const fd = new FormData(); fd.append('image', file)
      const response = await aiAPI.classify(fd)
      const result = response.data?.result || response.data?.data?.result || response.data
      if (result && (result.label || result.class || result.waste_type)) {
        const detectedLabel = result.label || result.class || result.waste_type
        const confidence = result.confidence || 0.85
        const normalized = {
          label: detectedLabel,
          confidence,
          reliable: result.reliable ?? true,
          all_scores: result.all_scores || result.probabilities || {},
        }
        setAiResult(normalized)
        toast.success(`🤖 AI detected: ${detectedLabel.toUpperCase()} waste (${Math.round(confidence * 100)}%)`)

        // Auto-suggest issue type if not already selected
        setForm(prev => {
          if (!prev.issue_type) {
            let suggestedType = 'illegal_dumping'
            if (['plastic', 'dry'].includes(detectedLabel.toLowerCase())) suggestedType = 'full_dustbin'
            if (['wet'].includes(detectedLabel.toLowerCase())) suggestedType = 'overflowing_bin'
            if (['hazardous'].includes(detectedLabel.toLowerCase())) suggestedType = 'burning_waste'
            return { ...prev, issue_type: suggestedType }
          }
          return prev
        })
      }
    } catch (err) {
      console.error('AI Classification failed:', err)
      toast.error('AI analysis warning: Could not auto-detect category, please select issue type manually.')
    } finally { setClassifying(false) }
  }

  const onDrop = useCallback((files) => {
    if (files[0]) handleImageSelect(files[0])
  }, [])

  const startCamera = async () => {
    setIsCameraOpen(true)
    setPreview(null)
    setImage(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      toast.error('Could not access camera')
      setIsCameraOpen(false)
    }
  }

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    setIsCameraOpen(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    canvas.toBlob((blob) => {
      const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' })
      handleImageSelect(file)
      stopCamera()
    }, 'image/jpeg', 0.9)
  }

  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [] }, maxFiles: 1, maxSize: 5 * 1024 * 1024,
  })

  const getLocation = () => {
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoLoading(false); toast.success('Location captured!') },
      ()  => { setGeoLoading(false); toast.error('Could not get location. Enable GPS.') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSubmit = async () => {
    if (!form.issue_type) return toast.error('Select an issue type')
    if (!location)        return toast.error('Capture your location first')
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('issue_type',  form.issue_type)
      fd.append('lat',         location.lat)
      fd.append('lng',         location.lng)
      fd.append('description', form.description)
      if (image) fd.append('image', image)
      await complaintsAPI.submit(fd)
      setStep(3)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed')
    } finally { setSubmitting(false) }
  }

  if (step === 3) return (
    <div className="flex items-center justify-center min-h-[500px]">
      <div className="card p-10 max-w-md w-full text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Report Submitted!</h2>
        <p className="text-slate-500 mb-2">Your complaint has been registered and the authority has been notified.</p>
        <p className="text-green-600 font-semibold mb-6">+50 Eco Points earned 🌿</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => router.push('/citizen/dashboard')} className="btn-primary">Back to Dashboard</button>
          <button onClick={() => { setStep(1); setForm({ issue_type: '', description: '' }); setImage(null); setPreview(null); setLocation(null); setAiResult(null) }}
            className="btn-secondary">Report Another</button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Report Waste Issue</h1>
          <p className="page-sub">Submit a new waste complaint with photo and location</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form — 2 cols */}
        <div className="lg:col-span-2 space-y-5">
          {/* Image upload */}
          <div className="card p-6 overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h3 className="section-title mb-0">📸 Photo</h3>
              <button 
                onClick={() => isCameraOpen ? stopCamera() : startCamera()}
                className="text-xs font-semibold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-full transition-all border border-green-100 flex items-center gap-1.5"
              >
                {isCameraOpen ? (
                  <><span>✕</span> Close Camera</>
                ) : (
                  <><span>📷</span> Use Camera</>
                )}
              </button>
            </div>

            {isCameraOpen ? (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-[400px]">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                  <button onClick={capturePhoto} 
                    className="w-14 h-14 rounded-full bg-white border-4 border-slate-300 flex items-center justify-center hover:scale-105 transition-transform active:scale-95 shadow-lg">
                    <div className="w-10 h-10 rounded-full border-2 border-slate-800" />
                  </button>
                </div>
                <canvas ref={canvasRef} className="hidden" />
              </div>
            ) : (
              <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
                ${isDragActive ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-green-400 hover:bg-slate-50'}`}>
                <input {...getInputProps()} />
                {preview ? (
                  <div className="relative group">
                    <img src={preview} alt="preview" className="w-full max-h-64 object-cover rounded-lg mx-auto" />
                    {classifying && (
                      <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                        <span className="text-white font-medium animate-pulse">🤖 AI analyzing...</span>
                      </div>
                    )}
                    <button onClick={e => { e.stopPropagation(); setImage(null); setPreview(null); setAiResult(null) }}
                      className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-all group-hover:scale-110">
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="py-6">
                    <div className="text-5xl mb-4">📸</div>
                    <p className="text-slate-600 font-medium text-lg">Report with a photo</p>
                    <p className="text-slate-400 text-sm mt-1">Drag & drop photo or click to browse</p>
                    <p className="text-slate-400 text-xs mt-4 bg-slate-100 py-1 px-3 rounded-full inline-block">AI auto-detects waste category</p>
                  </div>
                )}
              </div>
            )}
            {aiResult && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                <span className="text-xl">🤖</span>
                <div>
                  <span className="text-sm font-semibold text-green-800">AI detected: {aiResult.label} waste</span>
                  <span className="text-xs text-green-600 ml-2">({Math.round(aiResult.confidence * 100)}% confidence)</span>
                </div>
              </div>
            )}
          </div>

          {/* Issue type */}
          <div className="card p-6">
            <h3 className="section-title">⚠️ Issue Type <span className="text-red-500">*</span></h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {ISSUE_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm({ ...form, issue_type: t.value })}
                  className={`p-3 rounded-xl border text-left transition-all
                    ${form.issue_type === t.value
                      ? 'border-green-500 bg-green-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <div className="text-2xl mb-1.5">{t.emoji}</div>
                  <div className={`text-xs font-semibold ${form.issue_type === t.value ? 'text-green-800' : 'text-slate-700'}`}>{t.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="card p-6">
            <h3 className="section-title">📝 Additional Details</h3>
            <textarea className="input resize-none h-28"
              placeholder="Describe the issue in more detail (optional)..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          {/* Location */}
          <div className="card p-6">
            <h3 className="section-title">📍 Location <span className="text-red-500">*</span></h3>
            <button onClick={getLocation} disabled={geoLoading}
              className={`w-full p-4 rounded-xl border-2 text-sm font-medium transition-all
                ${location ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 hover:border-green-400 text-slate-600'}`}>
              {geoLoading ? '📡 Getting location...'
                : location ? `✅ Location captured\n${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
                : '📍 Click to capture GPS location'}
            </button>
            {location && (
              <p className="text-xs text-slate-400 mt-2 text-center">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
            )}
          </div>

          {/* Summary & submit */}
          <div className="card p-6">
            <h3 className="section-title">📋 Summary</h3>
            <div className="space-y-2 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-slate-500">Issue type</span>
                <span className={`font-medium ${form.issue_type ? 'text-slate-800' : 'text-slate-300'}`}>
                  {form.issue_type ? form.issue_type.replace(/_/g, ' ') : 'Not selected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Photo</span>
                <span className={`font-medium ${image ? 'text-green-600' : 'text-slate-300'}`}>{image ? '✓ Added' : 'Not added'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location</span>
                <span className={`font-medium ${location ? 'text-green-600' : 'text-slate-300'}`}>{location ? '✓ Captured' : 'Not captured'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Eco points</span>
                <span className="font-semibold text-green-600">+50 pts</span>
              </div>
            </div>
            <button onClick={handleSubmit} disabled={submitting || !form.issue_type || !location}
              className="btn-primary w-full py-3 text-base">
              {submitting ? 'Submitting...' : '🚀 Submit Report'}
            </button>
            <p className="text-xs text-slate-400 text-center mt-2">Your report will be reviewed by local authorities</p>
          </div>
        </div>
      </div>
    </div>
  )
}

ReportPage.getLayout = page => <CitizenLayout>{page}</CitizenLayout>
