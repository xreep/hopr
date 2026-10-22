import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from './ui'
import SignaturePad from './SignaturePad'
import { compressImage } from '../utils/image'
import Icon from './icons'
import { useT } from '../i18n/language'

// Completing a stop: delivery photo (camera or file), customer signature, optional note.
// onSubmit({ photo, signature, note }) sends it, or keeps it on the phone while offline,
// and resolves to true once it is done.
export default function ProofOfDeliveryDialog({ stop, onClose, onSubmit }) {
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
      const ok = await onSubmit({
        photo,
        signature: signed ? await padRef.current.toBlob() : null,
        note: note.trim() || undefined
      })
      if (!ok) setBusy(false)
    } catch {
      toast.error(t('pod.failed'))
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
