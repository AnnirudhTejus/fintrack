import type { Metadata } from 'next'
import './globals.css'
import MobileNav from '@/components/MobileNav'
import AuthGate from '@/components/AuthGate'

export const metadata: Metadata = {
  title: 'FinTrack',
  description: 'Personal finance tracker',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#fff',
          color: '#111827',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <AuthGate>
          <div
            style={{
              width: '100%',
              minHeight: '100vh',
              overflowX: 'hidden',
            }}
          >
            {children}
          </div>
          <MobileNav />
        </AuthGate>
      </body>
    </html>
  )
}