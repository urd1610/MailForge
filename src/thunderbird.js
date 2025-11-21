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

module.exports = {
  getThunderbirdProfilesIniPath,
  parseProfilesIni,
};
