'use strict';

/**
 * Downloads the standalone WiX v3 toolset into ./tools/wix3.
 *
 * WiX v3 ships as a plain folder of executables that run on the .NET Framework
 * already present in Windows, so this is the only build-time tool ShopWise
 * needs — no .NET SDK, no npm packages.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const URL = 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip';

const repoRoot = path.resolve(__dirname, '..');
const toolsDir = path.join(repoRoot, 'tools');
const wixDir = path.join(toolsDir, 'wix3');
const zipPath = path.join(toolsDir, 'wix3-binaries.zip');

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  await fsp.writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  if (fs.existsSync(path.join(wixDir, 'candle.exe'))) {
    console.log(`WiX already present at ${wixDir}`);
    return;
  }

  await fsp.mkdir(toolsDir, { recursive: true });

  console.log(`Downloading WiX toolset…\n  ${URL}`);
  await download(URL, zipPath);

  console.log(`Extracting to ${wixDir}`);
  await fsp.rm(wixDir, { recursive: true, force: true });
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${wixDir}' -Force`],
    { stdio: 'inherit' }
  );
  await fsp.rm(zipPath, { force: true });

  if (!fs.existsSync(path.join(wixDir, 'candle.exe'))) {
    throw new Error('candle.exe missing after extraction — the archive layout may have changed');
  }
  console.log('WiX toolset ready.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
