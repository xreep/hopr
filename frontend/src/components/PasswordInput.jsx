import { useState } from 'react'
import Icon from './icons'

// Password field with a show/hide toggle. Other props go to the <input>.
export default function PasswordInput({ className = '', ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="password-field">
      <input {...props} type={visible ? 'text' : 'password'} className={`form-input ${className}`} />
      <button type="button" className="password-toggle" onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={props.disabled}>
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  )
}
