import { createContext, useCallback, useContext, useState } from 'react'
import { Modal } from './ui'

const ConfirmContext = createContext(null)

// Promise-based confirmation in the app's own dialog instead of window.confirm:
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Delete route?', confirmLabel: 'Delete route', tone: 'danger' }))) return
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)

  const confirm = useCallback(options => new Promise(resolve => {
    setRequest({ cancelLabel: 'Cancel', confirmLabel: 'Confirm', tone: 'primary', ...options, resolve })
  }), [])

  const settle = useCallback(answer => {
    setRequest(current => {
      current?.resolve(answer)
      return null
    })
  }, [])
  const cancel = useCallback(() => settle(false), [settle])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <Modal
          title={request.title}
          onClose={cancel}
          size="sm"
          labelledBy="confirm-title"
          footer={(
            <>
              {/* Cancel comes first in focus order so Enter never destroys by accident */}
              <button type="button" className="btn btn-outline" onClick={cancel}>{request.cancelLabel}</button>
              <button type="button" className={`btn ${request.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => settle(true)}>
                {request.confirmLabel}
              </button>
            </>
          )}
        >
          <div className="text-small text-ink-300 space-y-2">
            {[].concat(request.message).filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used within a ConfirmProvider')
  return confirm
}
