// iOS requires a launch image matching the screen's size and pixel density.
// Includes both SE sizes; the remaining sizes cover common iPhones and iPads.
// Size reference: https://quasar.dev/quasar-cli-vite/developing-pwa/app-icons-pwa/
const appleScreens = [
  [320, 568, 2], // First-generation SE
  [375, 667, 2], // Second/third-generation SE, 6/7/8
  [414, 736, 3], // Plus
  [375, 812, 3], // X/XS/11 Pro
  [414, 896, 2], // XR/11
  [414, 896, 3], // XS Max/11 Pro Max
  [360, 780, 3], // 12/13 mini
  [390, 844, 3], // 12/13/14/16e
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [393, 852, 3], // 14 Pro, 15/15 Pro/16
  [430, 932, 3], // 14/15 Pro Max, 15/16 Plus
  [402, 874, 3], // 16 Pro, 17/17 Pro
  [420, 912, 3], // Air
  [440, 956, 3], // 16/17 Pro Max
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1112, 2],
  [834, 1194, 2],
  [834, 1210, 2],
  [744, 1133, 2],
  [1024, 1366, 2],
  [1032, 1376, 2],
] as const

export const startupImages = appleScreens.flatMap(([width, height, scale]) =>
  (['portrait', 'landscape'] as const).map((orientation) => {
    const pixelWidth = (orientation === 'portrait' ? width : height) * scale
    const pixelHeight = (orientation === 'portrait' ? height : width) * scale
    return {
      pixelWidth,
      pixelHeight,
      scale,
      url: `/startup/apple-${pixelWidth}x${pixelHeight}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: ${orientation})`,
    }
  })
)

export const appleStartupImages = startupImages.map(({ url, media }) => ({ url, media }))
