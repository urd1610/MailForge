const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Resolve the path to Thunderbird's profiles.ini for the current platform.
 * - Windows: %APPDATA%/Thunderbird/profiles.ini
 * - macOS: ~/Library/Thunderbird/profiles.ini
 * - Linux: ~/.thunderbird/profiles.ini
 */
function getThunderbirdProfilesIniPath() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'Thunderbird', 'profiles.ini');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Thunderbird', 'profiles.ini');
  }

  return path.join(os.homedir(), '.thunderbird', 'profiles.ini');
}

/** Minimal parser for Thunderbird's profiles.ini that extracts profile sections. */
function parseProfilesIni(content) {
  const profiles = [];
  let currentProfile = null;

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) {
      return;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1);
      if (section.toLowerCase().startsWith('profile')) {
        currentProfile = { section };
        profiles.push(currentProfile);
      } else {
        currentProfile = null;
      }
      return;
    }

    if (currentProfile && line.includes('=')) {
      const [key, ...rest] = line.split('=');
      currentProfile[key.trim().toLowerCase()] = rest.join('=').trim();
    }
  });

  return profiles;
}

/**
 * Resolve the default Thunderbird profile directory from profiles.ini.
 * Falls back to the first profile if no default flag is found.
 */
function resolveDefaultProfilePath(profilesIniPath = getThunderbirdProfilesIniPath()) {
  if (!fs.existsSync(profilesIniPath)) {
    return null;
  }

  const content = fs.readFileSync(profilesIniPath, 'utf-8');
  const profiles = parseProfilesIni(content);
  if (!profiles.length) {
    return null;
  }

  const defaultProfile =
    profiles.find((profile) => profile.default === '1') ||
    profiles.find((profile) => profile.name?.toLowerCase() === 'default') ||
    profiles[0];

  if (!defaultProfile.path) {
    return null;
  }

  const baseDir = defaultProfile.isrelative === '1' ? path.dirname(profilesIniPath) : '';
  return path.resolve(baseDir || '', defaultProfile.path);
}

/**
 * Find Thunderbird mail root directories (Mail/ImapMail) under a profile.
 * Returns account directories (e.g., ImapMail/gmail.example.com).
 */
function findThunderbirdMailRoots(profileDir) {
  const roots = [];
  const candidates = ['Mail', 'ImapMail'];

  candidates.forEach((folder) => {
    const base = path.join(profileDir, folder);
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
      return;
    }

    const entries = fs.readdirSync(base, { withFileTypes: true });
    const accountDirs = entries.filter((entry) => entry.isDirectory());

    if (!accountDirs.length) {
      roots.push(base);
      return;
    }

    accountDirs.forEach((dir) => {
      roots.push(path.join(base, dir.name));
    });
  });

  return roots;
}

module.exports = {
  getThunderbirdProfilesIniPath,
  parseProfilesIni,
  resolveDefaultProfilePath,
  findThunderbirdMailRoots,
};
