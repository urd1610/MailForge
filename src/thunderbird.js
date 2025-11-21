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

/**
 * Minimal parser for Thunderbird's profiles.ini.
 * - Extracts Profile* sections as profiles array
 * - Collects Install* sections to read the per-install default profile
 */
function parseProfilesIni(content) {
  const profiles = [];
  const installSections = [];
  let currentProfile = null;

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) {
      return;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1);
      const normalized = section.toLowerCase();
      if (normalized.startsWith('profile')) {
        currentProfile = { section };
        profiles.push(currentProfile);
      } else if (normalized.startsWith('install')) {
        currentProfile = { section };
        installSections.push(currentProfile);
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

  profiles.installSections = installSections;
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

  const baseDir = path.dirname(profilesIniPath);
  const resolveProfilePath = (profile) => {
    const base = profile.isrelative === '1' ? baseDir : '';
    return path.resolve(base || '', profile.path);
  };

  const installDefaults = profiles.installSections || [];
  const installDefaultEntry = installDefaults.find((install) => install.default);

  const installDefaultProfile =
    installDefaultEntry &&
    profiles.find(
      (profile) =>
        profile.path && resolveProfilePath(profile) === path.resolve(baseDir, installDefaultEntry.default)
    );

  const defaultProfile =
    installDefaultProfile ||
    profiles.find((profile) => profile.default === '1') ||
    profiles.find((profile) => profile.name?.toLowerCase() === 'default-release') ||
    profiles.find((profile) => profile.name?.toLowerCase() === 'default') ||
    profiles[0];

  if (!defaultProfile.path) {
    return null;
  }

  return resolveProfilePath(defaultProfile);
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

/**
 * Recursively attach fs.watch listeners when recursive option is unavailable.
 */
function attachWatchersRecursively(dir, handler, watchers) {
  const watcher = fs.watch(dir, handler);
  watchers.push(watcher);

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => {
      attachWatchersRecursively(path.join(dir, entry.name), handler, watchers);
    });
}

/**
 * Start watching Thunderbird mail storage directories.
 * Calls onActivity when file changes occur and returns a stop function.
 */
function watchThunderbirdMail({ onActivity, onError } = {}) {
  const profileDir = resolveDefaultProfilePath();
  if (!profileDir) {
    const profilesIniPath = getThunderbirdProfilesIniPath();
    const detailedError = `Thunderbirdのプロファイルが見つかりません。\n確認事項:\n- Thunderbirdがインストールされているか\n- プロファイルが初期化されているか\n- profiles.iniのパス: ${profilesIniPath}`;
    throw new Error(detailedError);
  }

  const mailRoots = findThunderbirdMailRoots(profileDir);
  if (!mailRoots.length) {
    const detailedError = `Thunderbirdのメールディレクトリが見つかりません。\n確認事項:\n- プロファイルディレクトリ: ${profileDir}\n- Mail/またはImapMail/ディレクトリが存在するか\n- メールアカウントが設定されているか`;
    throw new Error(detailedError);
  }

  const watchers = [];

  mailRoots.forEach((dir) => {
    const handler = (eventType, filename) => {
      if (!filename) {
        return;
      }

      // ファイル拡張子からメール関連ファイルか判定
      const fullPath = path.join(dir, filename.toString());
      const isMailFile = filename.toString().endsWith('.msf') || 
                        filename.toString().endsWith('.dat') ||
                        !filename.toString().includes('.');

      // イベントタイプをより具体的に判定
      let detailedEventType = eventType;
      if (isMailFile) {
        if (eventType === 'rename') {
          detailedEventType = 'mail_received';
        } else if (eventType === 'change') {
          detailedEventType = 'mail_updated';
        }
      }

      onActivity?.({
        eventType: detailedEventType,
        filePath: fullPath,
        watchedDir: dir,
        timestamp: Date.now(),
        isMailFile,
      });
    };

    try {
      const watcher = fs.watch(dir, { recursive: process.platform !== 'linux' }, handler);
      watcher.on('error', (error) => onError?.(error, dir));
      watchers.push(watcher);
    } catch (error) {
      const watchError = new Error(`ディレクトリの監視に失敗しました: ${dir}\nエラー: ${error.message}\n考えられる原因:\n- ディレクトリのアクセス権限\n- ディレクトリが存在しない\n- システムのファイル監視制限`);
      onError?.(watchError, dir);
      try {
        attachWatchersRecursively(dir, handler, watchers);
      } catch (nestedError) {
        const recursiveError = new Error(`再帰的監視にも失敗しました: ${dir}\nエラー: ${nestedError.message}`);
        onError?.(recursiveError, dir);
      }
    }
  });

  if (!watchers.length) {
    throw new Error('Thunderbirdのメールフォルダー監視に完全に失敗しました。すべてのディレクトリで監視を開始できません。');
  }

  // 監視開始直後にテストアクティビティを送信
  setTimeout(() => {
    onActivity?.({
      eventType: 'info',
      filePath: `${mailRoots.length}箇所のメールディレクトリの監視を正常に開始しました`,
      watchedDir: mailRoots[0],
      timestamp: Date.now(),
      isMailFile: false,
    });
  }, 1000);

  return {
    stop: () => {
      watchers.splice(0).forEach((watcher) => watcher.close());
    },
    watchedPaths: mailRoots,
  };
}

module.exports = {
  getThunderbirdProfilesIniPath,
  parseProfilesIni,
  resolveDefaultProfilePath,
  findThunderbirdMailRoots,
  attachWatchersRecursively,
  watchThunderbirdMail,
};
