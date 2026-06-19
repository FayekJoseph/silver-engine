#!/usr/bin/env node
'use strict';

// Render the Silver Engine board schematic from SVG to PNG.
// Reproducible replacement for ad-hoc rendering: `npm run render:board`.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const svg = path.join(root, 'silver-engine-board.svg');
const png = path.join(root, 'silver-engine-board.png');

sharp(Buffer.from(fs.readFileSync(svg)), { density: 140 })
  .png()
  .toFile(png)
  .then((info) => console.log(`Rendered ${path.basename(png)} (${info.width}x${info.height})`))
  .catch((err) => {
    console.error(`Render failed: ${err.message}`);
    process.exit(1);
  });
