'use client'

import { useEffect } from 'react'

type ToastProps = {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
  duration?: number
}

export default function Toast({
  message,
  type = 'success',
  onClose,
  duration = 3000,
}: ToastProps) {
  useEffect(() => {
    if (!message) return

    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [message, duration, onClose])

  if (!message) return null

  const isError = type === 'error'

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        minWidth: '260px',
        maxWidth: '420px',
        borderRadius: '12px',
        padding: '12px 14px',
        boxShadow: '0 12px 30px rgba(0,0,0,0.14)',
        border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`,
        background: isError ? '#fef2f2' : '#f0fdf4',
        color: isError ? '#991b1b' : '#166534',
        fontSize: '14px',
        fontWeight: 600,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ lineHeight: 1.4 }}>{message}</div>

        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            padding: 0,
          }}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    </div>
  )
}
