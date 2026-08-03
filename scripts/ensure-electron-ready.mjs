import childProcess from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function getElectronPlatformPath(platform = process.env.npm_config_platform || os.platform()) {
  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

function getElectronArch(platform, arch = process.env.npm_config_arch || process.arch) {
  if (platform === 'darwin' && process.platform === 'darwin' && arch === 'x64' && process.env.npm_config_arch === undefined) {
    try {
      const output = childProcess.execSync('sysctl -in sysctl.proc_translated');
      if (output.toString().trim() === '1') {
        return 'arm64';
      }
    } catch {
      // Rosetta 检测失败时沿用 Node 报告的架构。
    }
  }

  return arch;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function extractElectronZip(zipPath, distDir) {
  const result = childProcess.spawnSync('ditto', ['-x', '-k', zipPath, distDir], { encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Electron 压缩包解压失败: ${result.stderr || result.stdout || `退出码 ${result.status}`}`);
  }
}

function signElectronApp(electronDir, platform) {
  if (platform !== 'darwin') {
    return;
  }

  const appPath = path.join(electronDir, 'dist', 'Electron.app');
  const result = childProcess.spawnSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Electron 本地签名失败: ${result.stderr || result.stdout || `退出码 ${result.status}`}`);
  }
}

export async function ensureElectronReady({ rootRequire = createRequire(import.meta.url), log = console.log } = {}) {
  const packageJsonPath = rootRequire.resolve('electron/package.json');
  const electronDir = path.dirname(packageJsonPath);
  const electronRequire = createRequire(path.join(electronDir, 'install.js'));
  const { version } = await readJson(packageJsonPath);
  const platform = process.env.npm_config_platform || process.platform;
  const arch = getElectronArch(platform);
  const platformPath = getElectronPlatformPath(platform);
  const distDir = path.join(electronDir, 'dist');
  const executablePath = process.env.ELECTRON_OVERRIDE_DIST_PATH
    ? path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, platformPath)
    : path.join(distDir, platformPath);
  const pathFile = path.join(electronDir, 'path.txt');
  const versionFile = path.join(distDir, 'version');

  if (existsSync(executablePath)) {
    await mkdir(distDir, { recursive: true });
    signElectronApp(electronDir, platform);
    await writeFile(pathFile, platformPath);
    await writeFile(versionFile, version);
    log(`Electron 可执行文件已存在，已确认入口: ${platformPath}`);
    return { changed: false, executablePath };
  }

  const { downloadArtifact } = electronRequire('@electron/get');
  const useRemoteChecksums = process.env.electron_use_remote_checksums ?? process.env.npm_config_electron_use_remote_checksums;
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    force: process.env.force_no_cache === 'true',
    cacheRoot: process.env.electron_config_cache,
    checksums: useRemoteChecksums ? undefined : electronRequire('./checksums.json'),
    platform,
    arch,
  });

  await mkdir(distDir, { recursive: true });
  extractElectronZip(zipPath, distDir);
  signElectronApp(electronDir, platform);
  await writeFile(pathFile, platformPath);
  await writeFile(versionFile, version);

  if (!existsSync(executablePath)) {
    throw new Error(`Electron 安装后仍未找到可执行文件: ${executablePath}`);
  }

  log(`Electron 可执行文件已补齐: ${platformPath}`);
  return { changed: true, executablePath };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await ensureElectronReady();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}
