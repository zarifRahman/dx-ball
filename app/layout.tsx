// app/layout.tsx
import "../src/app/globals.css" // Corrected import path

export const metadata = {
  title: 'DX-Ball Game',
  description: 'A classic brick breaker game built with Next.js',
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
