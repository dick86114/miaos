#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appPath = process.argv[2];
if (!appPath) {
  console.error('Usage: node postbuild.js <path-to-miaos.app>');
  process.exit(1);
}

function run(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
  } catch (e) {
    return e.stderr || e.stdout || '';
  }
}

console.log('🔧 Post-build signing for miaos');
console.log('   App:', appPath);

// === 1. Remove all extended attributes and quarantine ===
console.log('\n🔓 Removing quarantine and extended attributes...');
run(`xattr -cr "${appPath}"`);
console.log('   ✅ Extended attributes removed');

// === 2. Create entitlements plist ===
const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.files.user-selected.read-write</key><true/>
</dict></plist>`;

const entitlementsPath = '/tmp/miaos-entitlements.plist';
fs.writeFileSync(entitlementsPath, entitlements);

// === 3. Sign nested code first (from inside out) ===
console.log('\n✍️  Signing nested components...');

const frameworksDir = path.join(appPath, 'Contents/Frameworks');
if (fs.existsSync(frameworksDir)) {
  // Sign dylibs first
  const items = fs.readdirSync(frameworksDir);
  for (const item of items) {
    const fullPath = path.join(frameworksDir, item);
    try {
      const stat = fs.statSync(fullPath);
      if (item.endsWith('.dylib')) {
        run(`codesign --force --sign - "${fullPath}"`);
      }
    } catch (e) {}
  }

  // Sign frameworks (deep inside)
  for (const item of items) {
    const fullPath = path.join(frameworksDir, item);
    if (item.endsWith('.framework')) {
      // Sign framework version
      const versionsDir = path.join(fullPath, 'Versions/A');
      if (fs.existsSync(versionsDir)) {
        // Sign Libraries inside framework
        const libsDir = path.join(versionsDir, 'Libraries');
        if (fs.existsSync(libsDir)) {
          try {
            const libs = fs.readdirSync(libsDir);
            for (const lib of libs) {
              if (lib.endsWith('.dylib')) {
                run(`codesign --force --sign - "${path.join(libsDir, lib)}"`);
              }
            }
          } catch (e) {}
        }
        // Sign Helpers inside framework
        const helpersDir = path.join(versionsDir, 'Helpers');
        if (fs.existsSync(helpersDir)) {
          try {
            const helpers = fs.readdirSync(helpersDir);
            for (const h of helpers) {
              const hPath = path.join(helpersDir, h);
              try {
                const hStat = fs.statSync(hPath);
                if (hStat.isDirectory() && h.endsWith('.app')) {
                  run(`codesign --force --sign - --entitlements "${entitlementsPath}" --deep "${hPath}"`);
                } else {
                  run(`codesign --force --sign - "${hPath}"`);
                }
              } catch (e) {}
            }
          } catch (e) {}
        }
        // Sign framework binary
        const fwName = item.replace('.framework', '');
        const fwBin = path.join(versionsDir, fwName);
        if (fs.existsSync(fwBin)) {
          run(`codesign --force --sign - "${fwBin}"`);
        }
      }
      run(`codesign --force --sign - "${fullPath}"`);
      console.log(`   ✅ ${item}`);
    }
  }

  // Sign helper apps
  for (const item of items) {
    const fullPath = path.join(frameworksDir, item);
    if (item.endsWith('.app')) {
      run(`codesign --force --sign - --entitlements "${entitlementsPath}" --deep "${fullPath}"`);
      console.log(`   ✅ ${item}`);
    }
  }
}

// === 4. Sign main app binary ===
console.log('\n✍️  Signing main app...');
const mainBin = path.join(appPath, 'Contents/MacOS/miaos');
if (fs.existsSync(mainBin)) {
  run(`codesign --force --sign - --entitlements "${entitlementsPath}" "${mainBin}"`);
}

// Sign the main app bundle
run(`codesign --force --sign - --entitlements "${entitlementsPath}" --deep "${appPath}"`);
console.log(`   ✅ miaos.app`);

// === 5. Verify ===
console.log('\n🔍 Verifying...');
const verifyResult = run(`codesign --verify --deep --strict --verbose=2 "${appPath}" 2>&1`);
if (verifyResult.includes('valid on disk')) {
  console.log('   ✅ Signature verification passed');
} else {
  console.log('   ℹ️ ', verifyResult.trim().split('\n').pop());
}

// Remove xattr after signing
run(`xattr -cr "${appPath}"`);

console.log('\n✅ Post-build signing complete!');
