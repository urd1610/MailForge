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

module.exports = {
  getThunderbirdProfilesIniPath,
};
