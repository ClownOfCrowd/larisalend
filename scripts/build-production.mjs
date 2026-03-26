import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import sharp from 'sharp';
import CleanCSS from 'clean-css';
import { minify as minifyHtml } from 'html-minifier-terser';
import ffmpegPath from 'ffmpeg-static';

const root = process.cwd();
const srcIndex = path.join(root, 'index.html');
const srcStyles = path.join(root, 'styles.css');
const srcMedia = path.join(root, 'media');

const distDir = path.join(root, 'dist');
const distMedia = path.join(distDir, 'media');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

async function ensureCleanDist() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distMedia, { recursive: true });
}

async function minifyStyles() {
  const css = await fs.readFile(srcStyles, 'utf8');
  const result = new CleanCSS({ level: 2 }).minify(css);

  if (result.errors.length) {
    throw new Error(`CSS minification failed: ${result.errors.join('; ')}`);
  }

  await fs.writeFile(path.join(distDir, 'styles.css'), result.styles, 'utf8');
}

async function minifyIndex() {
  const html = await fs.readFile(srcIndex, 'utf8');
  const minified = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: {
      compress: true,
      mangle: true,
      format: { comments: false }
    },
    removeRedundantAttributes: true,
    useShortDoctype: true,
    keepClosingSlash: true
  });

  await fs.writeFile(path.join(distDir, 'index.html'), minified, 'utf8');
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

async function optimizeVideo(inputPath, outputPath, ext) {
  const tempOutput = `${outputPath}.tmp${ext}`;

  const common = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-an'];
  const args = ext === '.webm'
    ? [
        ...common,
        '-c:v', 'libvpx-vp9',
        '-b:v', '4M',
        '-maxrate', '6M',
        '-bufsize', '8M',
        '-deadline', 'good',
        '-pix_fmt', 'yuv420p',
        tempOutput
      ]
    : [
        ...common,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-profile:v', 'high',
        '-level', '4.1',
        '-b:v', '5M',
        '-maxrate', '6M',
        '-bufsize', '10M',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        tempOutput
      ];

  await runFfmpeg(args);
  const [sourceStat, optimizedStat] = await Promise.all([
    fs.stat(inputPath),
    fs.stat(tempOutput)
  ]);

  if (optimizedStat.size >= sourceStat.size) {
    await fs.rm(tempOutput, { force: true });
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  await fs.rename(tempOutput, outputPath);
}

async function optimizeImage(inputPath, outputPath, ext) {
  const tempOutput = `${outputPath}.tmp${ext}`;
  const transformer = sharp(inputPath, { sequentialRead: true });

  if (ext === '.jpg' || ext === '.jpeg') {
    await transformer
      .jpeg({ quality: 88, mozjpeg: true, progressive: true, chromaSubsampling: '4:4:4' })
      .toFile(tempOutput);
  } else if (ext === '.png') {
    await transformer
      .png({ compressionLevel: 9, effort: 8, palette: false })
      .toFile(tempOutput);
  } else {
    await transformer
      .webp({ quality: 90, effort: 6 })
      .toFile(tempOutput);
  }

  const [sourceStat, optimizedStat] = await Promise.all([
    fs.stat(inputPath),
    fs.stat(tempOutput)
  ]);

  if (optimizedStat.size >= sourceStat.size) {
    await fs.rm(tempOutput, { force: true });
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  await fs.rename(tempOutput, outputPath);
}

async function copyOrOptimizeMedia() {
  const entries = await fs.readdir(srcMedia, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const inputPath = path.join(srcMedia, entry.name);
    const outputPath = path.join(distMedia, entry.name);
    const ext = path.extname(entry.name).toLowerCase();

    try {
      if (IMAGE_EXTENSIONS.has(ext)) {
        await optimizeImage(inputPath, outputPath, ext);
      } else if (VIDEO_EXTENSIONS.has(ext) && ffmpegPath) {
        await optimizeVideo(inputPath, outputPath, ext);
      } else {
        await fs.copyFile(inputPath, outputPath);
      }
    } catch (error) {
      await fs.copyFile(inputPath, outputPath);
      console.warn(`Skipped optimization for ${entry.name}: ${error.message}`);
    }
  }
}

async function getDirectorySizeBytes(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(fullPath);
    } else {
      const stat = await fs.stat(fullPath);
      total += stat.size;
    }
  }

  return total;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  await ensureCleanDist();
  await minifyStyles();
  await minifyIndex();
  await copyOrOptimizeMedia();

  const sourceSize = await getDirectorySizeBytes(srcMedia);
  const distSize = await getDirectorySizeBytes(distMedia);

  console.log(`Source media size: ${formatMb(sourceSize)}`);
  console.log(`Optimized media size: ${formatMb(distSize)}`);
  console.log(`Saved: ${formatMb(sourceSize - distSize)}`);
  console.log('Production build ready in dist/');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
