import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredDocuments = [
  "README.md",
  "AGENTS.md",
  "Codex.md",
  "CLAUDE.md",
  "MEMORY.md",
  "BACKEND_GUIDE.md",
  "SCHEMA_MIGRATION_GUIDE.md",
  "docs/ARCHITECTURE.md",
  "docs/DEVOPS.md",
  "docs/NAVERPAY_GUIDE.md",
  "docs/TECHNICAL-CHALLENGES.md",
];
function listTrackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

const failures = [];
const trackedFiles = new Set(listTrackedFiles());

for (const document of requiredDocuments) {
  if (!existsSync(join(root, document))) failures.push(`필수 문서 없음: ${document}`);
}

// 코드에서 직접 참조하는 env key가 예제 카탈로그에서 빠지면 실패한다.
// 주석 처리된 선택 키(`# KEY=`)도 문서화된 것으로 인정한다.
const envExample = readFileSync(join(root, ".env.example"), "utf8");
const documentedEnvKeys = new Set(
  [...envExample.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map(
    (match) => match[1],
  ),
);
const envSourceFiles = [...trackedFiles]
  .filter(
    (file) =>
      (/^(?:server|shared)\/.*\.(?:ts|mts|cts)$/.test(file) ||
        file === "drizzle.config.ts") &&
      existsSync(join(root, file)),
  )
  .map((file) => join(root, file));
const referencedEnvKeys = new Set();
for (const file of envSourceFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    referencedEnvKeys.add(match[1]);
  }
  for (const match of source.matchAll(/process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g)) {
    referencedEnvKeys.add(match[1]);
  }
}

// logger는 process.env[LOGGER_ENV_KEYS.*] 형태이므로 상수 값도 catalog에 포함한다.
const loggerConstants = readFileSync(join(root, "shared/constants/logger.ts"), "utf8");
const loggerEnvBlock = loggerConstants.match(
  /export const LOGGER_ENV_KEYS\s*=\s*{([\s\S]*?)}\s*as const/,
);
if (loggerEnvBlock) {
  for (const match of loggerEnvBlock[1].matchAll(/:\s*"([A-Z][A-Z0-9_]*)"/g)) {
    referencedEnvKeys.add(match[1]);
  }
}
for (const key of [...referencedEnvKeys].sort()) {
  if (!documentedEnvKeys.has(key)) failures.push(`.env.example에 코드 참조 키 누락: ${key}`);
}

const markdownLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
const markdownFiles = new Set([
  ...[...trackedFiles].filter((file) => file.endsWith(".md")),
  ...requiredDocuments,
]);
for (const relativeFile of markdownFiles) {
  const file = join(root, relativeFile);
  if (!existsSync(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(markdownLinkPattern)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    if (
      !target ||
      target.startsWith("#") ||
      /^(?:https?:|mailto:|data:|app:)/i.test(target)
    ) {
      continue;
    }

    // 선택적 title(`path "title"`)은 경로 검사에서 제외한다.
    target = target.split(/\s+["']/)[0];
    const pathOnly = target.split("#", 1)[0];
    if (!pathOnly) continue;

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathOnly);
    } catch {
      failures.push(`${relative(root, file)}: 잘못 인코딩된 링크 ${target}`);
      continue;
    }

    const resolvedTarget = resolve(dirname(file), decodedPath);
    if (!resolvedTarget.startsWith(`${root}/`) && resolvedTarget !== root) {
      failures.push(`${relative(root, file)}: 저장소 밖 링크 ${target}`);
      continue;
    }
    if (!existsSync(resolvedTarget)) {
      failures.push(`${relative(root, file)}: 대상 없음 ${target}`);
      continue;
    }
    // stat 호출로 깨진 심볼릭 링크도 실패 처리한다.
    statSync(resolvedTarget);
  }
}

// package.json이 fresh clone에 없는 로컬/ignored 실행 파일을 가리키면 실패한다.
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const pendingTrackedFiles = new Set(["scripts/check-docs.mjs"]);
for (const [scriptName, command] of Object.entries(packageJson.scripts ?? {})) {
  for (const match of command.matchAll(
    /(?:^|[\s;&|])([^\s;&|"'`]+\.(?:ts|js|mjs|cjs|sh))(?=$|[\s;&|])/g,
  )) {
    const target = match[1].replace(/^\.\//, "");
    if (target.startsWith("dist/")) continue;
    if (!existsSync(join(root, target))) {
      failures.push(`package script ${scriptName}: 실행 대상 없음 ${target}`);
      continue;
    }
    if (!trackedFiles.has(target) && !pendingTrackedFiles.has(target)) {
      failures.push(`package script ${scriptName}: Git 미추적 실행 대상 ${target}`);
    }
  }
}

// custom migration runner가 실패를 성공 코드로 덮어쓰는 회귀를 막는다.
const migrationRunner = readFileSync(
  join(root, "server/scripts/run-migration.ts"),
  "utf8",
);
if (/process\.exit\(0\)/.test(migrationRunner)) {
  failures.push("run-migration.ts: 실패를 덮어쓸 수 있는 process.exit(0) 금지");
}
if (!/process\.exitCode\s*=\s*1/.test(migrationRunner)) {
  failures.push("run-migration.ts: 최상위 실패 시 process.exitCode = 1 필요");
}

if (failures.length > 0) {
  console.error("문서 검사 실패:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(
  "문서 검사 완료: 필수/추적 문서, Markdown 상대 링크, tracked server/shared env 카탈로그, package 실행 대상이 유효합니다.",
);
