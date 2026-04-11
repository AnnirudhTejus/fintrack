'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type RowActionItem = {
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
}

type RowActionsMenuProps = {
  items?: RowActionItem[]
}

export default function RowActionsMenu({ items = [] }: RowActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })

  const safeItems = useMemo<RowActionItem[]>(() => {
    if (!Array.isArray(items)) return []

    return items.filter(
      (item) =>
        !!item &&
        typeof item.label === 'string' &&
        item.label.trim().length > 0
    )
  }, [items])

  const enabledItems = useMemo(() => {
    return safeItems.filter((item) => !item.disabled)
  }, [safeItems])

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !mounted) return

    const updatePosition = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const menuWidth = menu?.offsetWidth || 180
      const menuHeight = menu?.offsetHeight || 0
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const gutter = 8

      let left = rect.right - menuWidth
      let top = rect.bottom + 8

      if (left < gutter) left = gutter
      if (left + menuWidth > viewportWidth - gutter) {
        left = viewportWidth - menuWidth - gutter
      }

      if (top + menuHeight > viewportHeight - gutter) {
        top = rect.top - menuHeight - 8
      }

      if (top < gutter) top = gutter

      setMenuPosition({ top, left })
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, mounted, safeItems])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null

      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return

      setOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleItemClick = (item: RowActionItem) => {
    if (item.disabled) return
    if (typeof item.onClick !== 'function') return

    item.onClick()
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ram-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={enabledItems.length === 0}
        aria-label="Open row actions"
        aria-expanded={open}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          border: '1px solid #d1d5db',
          background: '#fff',
          color: '#475569',
          cursor: enabledItems.length === 0 ? 'not-allowed' : 'pointer',
          fontSize: '20px',
          fontWeight: 700,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          opacity: enabledItems.length === 0 ? 0.5 : 1,
        }}
      >
        …
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                minWidth: '180px',
                background: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: '12px',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.12)',
                overflow: 'hidden',
                zIndex: 9999,
              }}
            >
              {safeItems.map((item, index) => (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled || typeof item.onClick !== 'function'}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: 'none',
                    borderTop: index === 0 ? 'none' : '1px solid #f1f5f9',
                    background: '#fff',
                    textAlign: 'left',
                    fontSize: '14px',
                    fontWeight: 600,
                    color:
                      item.disabled || typeof item.onClick !== 'function'
                        ? '#94a3b8'
                        : item.danger
                        ? '#dc2626'
                        : '#111827',
                    cursor:
                      item.disabled || typeof item.onClick !== 'function'
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled && typeof item.onClick === 'function') {
                      e.currentTarget.style.background = '#f8fafc'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}