const sharp = require('sharp');

async function createPlaceholderImage(size, path) {
  try {
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 }
      }
    })
    .png()
    .toFile(path);
    console.log(`Successfully created ${path}`);
  } catch (err) {
    console.error(`Error creating ${path}:`, err);
  }
}

createPlaceholderImage(192, 'public/images/pwa-192x192.png');
createPlaceholderImage(512, 'public/images/pwa-512x512.png');
