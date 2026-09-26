import React, { useEffect, useId, useRef } from 'react'

// The one dialog primitive for every page. Escape closes it (and nothing behind it hears
// the key); focus moves in — the first field, else the first button that is not the ✕ —
// stays in (Tab wraps), and returns to the control that opened it; role=dialog named by its
// heading. Only a press AND release on the backdrop closes it: a text selection that ends
// outside the card never throws away what was typed.
// `frame` is the card class: 'modal' in the workspace, 'smodal' on the shell pages.
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialog(box, onClose, { autoFocus = true } = {}) {
  const opener = useRef(null)
  useEffect(() => {
    opener.current = document.activeElement
    const el = box.current
    const focusables = () => [...(el?.querySelectorAll(FOCUSABLE) || [])]
    if (autoFocus) {
      const all = focusables()
      const first = all.find((f) => !f.hasAttribute('data-close')) || all[0]
      if (first && !el.contains(document.activeElement)) first.focus()
    }
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return
        const i = f.indexOf(document.activeElement)
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('keydown', key, true)
      const o = opener.current
      if (o && o !== document.body && document.contains(o) && typeof o.focus === 'function') o.focus()
    }
  }, []) // eslint-disable-line
}

export default function Modal({ title, onClose, children, frame = 'modal', className = '', as: Tag = 'div', ...rest }) {
  const box = useRef(null), downOnBack = useRef(false)
  const id = useId()
  useDialog(box, onClose)
  const shell = frame.startsWith('smodal')
  return (
    <div className={`modal-back ${className}`.trim()}
      onPointerDown={(e) => { downOnBack.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnBack.current) onClose() }}>
      <Tag ref={box} className={frame} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onClick={(e) => e.stopPropagation()} {...rest}>
        {shell
          ? <div className="mhead"><h3 id={`${id}-t`}>{title}</h3><button type="button" className="mclose" onClick={onClose} aria-label="Close" data-close>✕</button></div>
          : <div className="modal-head"><h4 id={`${id}-t`}>{title}</h4><button type="button" onClick={onClose} aria-label="Close" data-close>✕</button></div>}
        {children}
      </Tag>
    </div>
  )
}
