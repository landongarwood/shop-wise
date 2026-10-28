'use strict';

/**
 * Stages an installable copy of ShopWise into ./stage, then (with --msi) builds
 * ./dist/ShopWise-<version>-x64.msi using the WiX toolset in ./tools/wix3.
 *
 * Nothing is compiled: the staged payload is the Node runtime plus the plain
 * JavaScript sources.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const pkg = require('../package.json');

const repoRoot = path.resolve(__dirname, '..');
const stageDir = path.join(repoRoot, 'stage');
const distDir = path.join(repoRoot, 'dist');
const wixDir = path.join(repoRoot, 'tools', 'wix3');
const wxsDir = path.join(repoRoot, 'build', 'wix');

const makeMsi = process.argv.includes('--msi');

const PE_SUBSYSTEM_GUI = 2;

function log(message) {
  console.log(message);
}

/**
 * Flips a copy of node.exe from the console subsystem to the GUI subsystem so
 * launching ShopWise does not flash a black console window. Only two bytes in
 * the PE optional header change; the code itself is untouched. stdout/stderr
 * then go nowhere, which is why the app logs to a file.
 */
function makeWindowless(exePath) {
  const fd = fs.openSync(exePath, 'r+');
  try {
    const dos = Buffer.alloc(4);
    fs.readSync(fd, dos, 0, 4, 0x3c);
    const peOffset = dos.readUInt32LE(0);

    const signature = Buffer.alloc(4);
    fs.readSync(fd, signature, 0, 4, peOffset);
    if (signature.toString('ascii') !== 'PE\0\0') {
      throw new Error(`not a PE image: ${exePath}`);
    }

    // PE header (24 bytes) is followed by the optional header; Subsystem sits
    // at offset 0x44 within it.
    const subsystemOffset = peOffset + 24 + 0x44;
    const current = Buffer.alloc(2);
    fs.readSync(fd, current, 0, 2, subsystemOffset);

    if (current.readUInt16LE(0) === PE_SUBSYSTEM_GUI) return;

    const patched = Buffer.alloc(2);
    patched.writeUInt16LE(PE_SUBSYSTEM_GUI, 0);
    fs.writeSync(fd, patched, 0, 2, subsystemOffset);
  } finally {
    fs.closeSync(fd);
  }
}

async function stage() {
  log(`Staging ${pkg.productName} ${pkg.version}`);

  await fsp.rm(stageDir, { recursive: true, force: true });
  await fsp.mkdir(stageDir, { recursive: true });

  // Application sources.
  await fsp.cp(path.join(repoRoot, 'src'), path.join(stageDir, 'src'), { recursive: true });
  await fsp.copyFile(path.join(repoRoot, 'package.json'), path.join(stageDir, 'package.json'));

  const licensePath = path.join(repoRoot, 'LICENSE.rtf');
  if (fs.existsSync(licensePath)) await fsp.copyFile(licensePath, path.join(stageDir, 'LICENSE.rtf'));

  // Node runtime, renamed and made windowless so it reads as the app itself.
  const exeName = `${pkg.productName}.exe`;
  const target = path.join(stageDir, exeName);
  await fsp.copyFile(process.execPath, target);
  makeWindowless(target);
  log(`  bundled runtime -> ${exeName} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);

  // Marker telling the app at runtime that it is an installed copy.
  await fsp.writeFile(
    path.join(stageDir, 'build-info.json'),
    JSON.stringify(
      {
        product: pkg.productName,
        version: pkg.version,
        builtAt: new Date().toISOString(),
        nodeVersion: process.version,
      },
      null,
      2
    ) + '\n'
  );

  log(`  staged at ${stageDir}`);
  return stageDir;
}

function wixTool(name) {
  const tool = path.join(wixDir, `${name}.exe`);
  if (!fs.existsSync(tool)) {
    throw new Error(`${name}.exe not found in ${wixDir}\nRun: npm run tools:wix`);
  }
  return tool;
}

/** MSI compares only the first three version fields, so normalise to x.y.z. */
function msiVersion(version) {
  const [major = '0', minor = '0', patch = '0'] = version.replace(/[-+].*$/, '').split('.');
  return [major, minor, patch].join('.');
}

async function msi() {
  const heat = wixTool('heat');
  const candle = wixTool('candle');
  const light = wixTool('light');

  await fsp.mkdir(distDir, { recursive: true });
  const objDir = path.join(distDir, 'obj');
  await fsp.rm(objDir, { recursive: true, force: true });
  await fsp.mkdir(objDir, { recursive: true });

  const filesWxs = path.join(objDir, 'Files.wxs');

  log('Harvesting staged files');
  execFileSync(
    heat,
    [
      'dir', stageDir,
      '-cg', 'AppFiles',
      '-dr', 'INSTALLFOLDER',
      '-var', 'var.StageDir',
      '-srd',   // don't create a directory for the root itself
      '-sreg',  // no registry harvesting
      '-scom', '-sfrag', '-suid',
      '-gg',    // generate stable GUIDs
      '-ke',    // keep empty directories out of the way
      '-nologo',
      '-out', filesWxs,
    ],
    { stdio: 'inherit' }
  );

  log('Compiling installer');
  const wixobjs = ['ShopWise', 'Files'].map((name) => path.join(objDir, `${name}.wixobj`));
  execFileSync(
    candle,
    [
      '-nologo',
      '-arch', 'x64',
      `-dStageDir=${stageDir}`,
      `-dProductName=${pkg.productName}`,
      `-dProductVersion=${msiVersion(pkg.version)}`,
      `-dIconFile=${path.join(repoRoot, 'assets', 'shopwise.ico')}`,
      '-out', objDir + path.sep,
      path.join(wxsDir, 'ShopWise.wxs'),
      filesWxs,
    ],
    { stdio: 'inherit' }
  );

  const output = path.join(distDir, `${pkg.productName}-${pkg.version}-x64.msi`);
  log('Linking MSI');
  execFileSync(
    light,
    ['-nologo', '-ext', 'WixUIExtension', '-cultures:en-us', '-sice:ICE61', '-out', output, ...wixobjs],
    { stdio: 'inherit' }
  );

  log(`\nBuilt ${output} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MB)`);
}

async function main() {
  await stage();
  if (makeMsi) await msi();
  else log('\nSkipped MSI (pass --msi, or run: npm run msi)');
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}`);
  process.exit(1);
});
