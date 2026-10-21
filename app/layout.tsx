// app/layout.tsx
import type { Viewport } from 'next'
import "../src/app/globals.css" // Corrected import path

export const metadata = {
  title: 'DX-Ball Game',
  description: 'A classic brick breaker game built with Next.js',
}

// Fullscreen arcade game: lock zoom so pinch/double-tap can't break canvas
// scaling, and extend under notches. viewport export is server-component only.
export const viewport: Viewport = {
  themeColor: '#0a0a14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
