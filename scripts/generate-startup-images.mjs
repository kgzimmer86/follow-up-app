// Run with Node 22.18+ from the repository: node scripts/generate-startup-images.mjs
// Exports the existing loading-screen design as static images for iOS launch.
// Uses the existing logo and Sharp bundled with Next.js. No network access.
import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { startupImages } from '../src/lib/startup-images.ts'

const publicRoot = new URL('../public/', import.meta.url)
const logo = await readFile(new URL('icon-512(1).png', publicRoot))
await mkdir(new URL('startup/', publicRoot), { recursive: true })

for (const { pixelWidth, pixelHeight, scale, url } of startupImages) {
  const width = pixelWidth / scale
  const height = pixelHeight / scale
  const left = (width - 96) / 2
  // iOS places the live page below the status bar. The native launch image
  // includes that area, so move the still group down by half the usual
  // 20 CSS-pixel status-bar height to match the live loading screen.
  const top = (height - 130) / 2 + 10
  // Match AppLoading: 96px logo, 24px corners, 28px gap, 160x6px bar.
  // iOS displays a still image; the webpage animates the bar once it arrives.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${width} ${height}">
    <defs>
      <clipPath id="logo"><rect x="${left}" y="${top}" width="96" height="96" rx="24"/></clipPath>
      <filter id="shadow" x="-60%" y="-60%" width="220%" height="240%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#00274c" flood-opacity="0.16"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="#f7f8fb"/>
    <rect x="${left}" y="${top}" width="96" height="96" rx="24" fill="#ffcb05" filter="url(#shadow)"/>
    <image href="data:image/png;base64,${logo.toString('base64')}" x="${left}" y="${top}" width="96" height="96" clip-path="url(#logo)"/>
    <rect x="${(width - 160) / 2}" y="${top + 124}" width="160" height="6" rx="3" fill="#d9e2f2"/>
    <rect x="${(width - 160) / 2}" y="${top + 124}" width="64" height="6" rx="3" fill="#175cd3"/>
  </svg>`

  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(
    new URL(url.slice(1), publicRoot).pathname
  )
}
console.log(`Generated ${startupImages.length} launch images.`)
