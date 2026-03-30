import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const EXCLUDED_PATHS = [
  'node_modules',
  'dist',
  '.env',
  '.DS_Store',
  '.vite',
  'coverage',
];

const INTERVAL_MS = Number(process.env.AUTO_SYNC_INTERVAL_MS ?? 15000);
const DRY_RUN = process.argv.includes('--dry-run');
const RUN_ONCE = process.argv.includes('--once');

function timestamp() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function log(message) {
  console.log(`[auto-sync ${timestamp()}] ${message}`);
}

function excludedArgs() {
  return EXCLUDED_PATHS.map((path) => `:(exclude)${path}`);
}

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  if (!allowFailure && result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }

  return result;
}

function currentBranch() {
  return runGit(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
}

function hasMergeConflicts() {
  return runGit(['diff', '--name-only', '--diff-filter=U'], { allowFailure: true }).stdout.trim().length > 0;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function getIncludedChanges() {
  const tracked = runGit([
    'diff',
    '--name-only',
    '--',
    '.',
    ...excludedArgs(),
  ]).stdout
    .split('\n')
    .map((line) => line.trim());

  const staged = runGit([
    'diff',
    '--cached',
    '--name-only',
    '--',
    '.',
    ...excludedArgs(),
  ]).stdout
    .split('\n')
    .map((line) => line.trim());

  const untracked = runGit([
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    '.',
    ...excludedArgs(),
  ]).stdout
    .split('\n')
    .map((line) => line.trim());

  return unique([...tracked, ...staged, ...untracked]);
}

function stageIncludedChanges(files) {
  for (const file of files) {
    runGit(['add', '-A', '--', file]);
  }
}

function getStagedFiles() {
  return runGit(['diff', '--cached', '--name-only']).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !EXCLUDED_PATHS.some((excluded) => file === excluded || file.startsWith(`${excluded}/`)));
}

function commitAndPush(files) {
  const branch = currentBranch();
  const summary = files.length > 5
    ? `${files.slice(0, 5).join(', ')} 等 ${files.length} 个文件`
    : files.join(', ');

  if (DRY_RUN) {
    log(`检测到将同步的文件：${summary}`);
    log('当前为 dry-run，仅验证流程，不执行 commit/push。');
    return;
  }

  const message = `chore: auto-sync ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`;
  runGit(['commit', '-m', message]);
  log(`已提交：${message}`);

  runGit(['push', 'origin', branch]);
  log(`已推送到 origin/${branch}`);
}

async function syncOnce() {
  if (hasMergeConflicts()) {
    log('检测到合并冲突，已暂停自动同步，请先手动解决冲突。');
    return;
  }

  const changes = getIncludedChanges();
  if (changes.length === 0) {
    log('没有需要同步的代码变更。');
    return;
  }

  stageIncludedChanges(changes);
  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    log('检测到的变更均在排除列表内，已跳过。');
    return;
  }

  commitAndPush(stagedFiles);
}

async function main() {
  log(`启动自动同步监听（间隔 ${INTERVAL_MS / 1000}s）${DRY_RUN ? ' [dry-run]' : ''}`);

  if (RUN_ONCE) {
    await syncOnce();
    return;
  }

  while (true) {
    try {
      await syncOnce();
    } catch (error) {
      log(`同步失败：${error instanceof Error ? error.message : String(error)}`);
    }

    await delay(INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error(`[auto-sync fatal] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
