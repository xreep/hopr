import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from './ui'
import SignaturePad from './SignaturePad'
import api, { errorMessage } from '../utils/api'
import { compressImage } from '../utils/image'
import Icon from './icons'
import { useT } from '../i18n/language'

// Completing a stop: delivery photo (camera or file), customer signature, optional note
export default function ProofOfDeliveryDialog({ route, stop, onClose, onCompleted }) {
  const { t } = useT()
  const fileRef = useRef(null)
  const padRef = useRef(null)
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [signed, setSigned] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pickPhoto = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const blob = await compressImage(file)
      setPhoto(blob)
      setPreview(URL.createObjectURL(blob))
    } catch (err) {
      toast.error(err.message)
    }
  }

  const submit = async () => {
    if (!photo && !signed) return toast.error(t('pod.needProof'))
    setBusy(true)
    try {
      const form = new FormData()
      if (photo) form.append('photo', photo, 'delivery.jpg')
      if (signed) form.append('signature', await padRef.current.toBlob(), 'signature.png')
      if (note.trim()) form.append('note', note.trim())
      const res = await api.post(`/routes/${route._id}/stops/${stop._id}/complete`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onCompleted(res.data.route)
    } catch (err) {
      toast.error(errorMessage(err, t('pod.failed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('pod.title', { name: stop.customerName || stop.address.split(',')[0] })} onClose={busy ? () => {} : onClose} size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-success" onClick={submit} disabled={busy || (!photo && !signed)}>
            {busy ? <><span className="spinner" /> {t('pod.uploading')}</> : <><Icon name="check" />{t('pod.complete')}</>}
          </button>
        </>
      )}>
      <div className="pod-grid">
        <div>
          <span className="form-label">{t('pod.photo')}</span>
          {preview ? (
            <div className="pod-photo">
              <img src={preview} alt={t('pod.photoPreview')} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{t('pod.retake')}</button>
            </div>
          ) : (
            <button type="button" className="pod-photo-empty" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" />
              <span>{t('pod.takePhoto')}</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} aria-label={t('pod.photo')} />
        </div>
        <SignaturePad ref={padRef} onChange={isEmpty => setSigned(!isEmpty)} />
      </div>
      <div className="form-group mt-4">
        <label className="form-label" htmlFor="pod-note">{t('pod.note')}</label>
        <textarea id="pod-note" className="form-input" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)}
          placeholder={t('pod.noteExample')} />
      </div>
      <p className="text-micro text-ink-400">{t('pod.hint')}</p>
    </Modal>
  )
}
