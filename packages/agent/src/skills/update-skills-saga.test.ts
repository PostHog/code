import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExtractZip = vi.hoisted(() =>
  vi.fn<(zipPath: string, extractDir: string) => Promise<void>>(async () => {}),
);

vi.mock("./extract-zip.js", () => ({
  extractZip: mockExtractZip,
}));

const mockFflateUnzipSync = vi.hoisted(() => vi.fn());
vi.mock("fflate", () => ({
  unzipSync: mockFflateUnzipSync,
}));

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { ...fs, default: fs };
});

vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return { ...fs.promises, default: fs.promises };
});

vi.mock("node:os", () => ({
  tmpdir: () => "/mock/tmp",
  homedir: () => "/mock/home",
  default: { tmpdir: () => "/mock/tmp", homedir: () => "/mock/home" },
}));

import {
  overlayDownloadedSkills,
  syncCodexSkills,
  UpdateSkillsSaga,
} from "./update-skills-saga.js";

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const RUNTIME_SKILLS_DIR = "/mock/skills";
const RUNTIME_PLUGIN_DIR = "/mock/plugins/posthog";
const CODEX_SKILLS_DIR = "/mock/home/.agents/skills";
const TEMP_DIR = "/mock/tmp/saga-test";

function simulateExtractZip() {
  mockExtractZip.mockImplementation(
    async (zipPath: string, extractDir: string) => {
      if (zipPath.includes("context-mill")) {
        vol.mkdirSync(extractDir, { recursive: true });
        vol.writeFileSync(`${extractDir}/omnibus-test-skill.zip`, "dummy");
        vol.writeFileSync(`${extractDir}/manifest.json`, "{}");
        vol.writeFileSync(`${extractDir}/other-skill.zip`, "dummy");
      } else {
        vol.mkdirSync(`${extractDir}/skills/remote-skill`, { recursive: true });
        vol.writeFileSync(
          `${extractDir}/skills/remote-skill/SKILL.md`,
          "# Remote",
        );
      }
    },
  );

  mockFflateUnzipSync.mockImplementation(() => ({
    "SKILL.md": new TextEncoder().encode(
      "---\nname: omnibus-test-skill\n---\n# Test Skill",
    ),
  }));
}

function createSagaInput() {
  return {
    runtimeSkillsDir: RUNTIME_SKILLS_DIR,
    runtimePluginDir: RUNTIME_PLUGIN_DIR,
    pluginPath: RUNTIME_PLUGIN_DIR,
    codexSkillsDir: CODEX_SKILLS_DIR,
    tempDir: TEMP_DIR,
    skillsZipUrl: "https://example.com/skills.zip",
    contextMillZipUrl: "https://example.com/context-mill.zip",
    downloadFile: vi.fn(async () => {}),
  };
}

describe("UpdateSkillsSaga", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vol.reset();
    vol.mkdirSync(TEMP_DIR, { recursive: true });
    vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
    vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "{}");
  });

  afterEach(() => {
    vol.reset();
  });

  it("downloads, extracts, and installs skills", async () => {
    simulateExtractZip();
    const input = createSagaInput();

    const saga = new UpdateSkillsSaga(mockLogger);
    const result = await saga.run(input);

    expect(result.success).toBe(true);
    expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}/remote-skill/SKILL.md`)).toBe(
      true,
    );
    expect(input.downloadFile).toHaveBeenCalledWith(
      "https://example.com/skills.zip",
      expect.stringContaining("skills.zip"),
    );
  });

  it("performs atomic swap of skills directory", async () => {
    vol.mkdirSync(`${RUNTIME_SKILLS_DIR}/old-skill`, { recursive: true });
    vol.writeFileSync(`${RUNTIME_SKILLS_DIR}/old-skill/SKILL.md`, "# Old");

    simulateExtractZip();
    const saga = new UpdateSkillsSaga(mockLogger);
    const result = await saga.run(createSagaInput());

    expect(result.success).toBe(true);
    expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}/remote-skill/SKILL.md`)).toBe(
      true,
    );
    expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}/old-skill`)).toBe(false);
    expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}.new`)).toBe(false);
    expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}.old`)).toBe(false);
  });

  it("overlays skills into runtime plugin dir", async () => {
    simulateExtractZip();
    const saga = new UpdateSkillsSaga(mockLogger);
    const result = await saga.run(createSagaInput());

    expect(result.success).toBe(true);
    expect(
      vol.existsSync(`${RUNTIME_PLUGIN_DIR}/skills/remote-skill/SKILL.md`),
    ).toBe(true);
  });

  it("downloads and merges context-mill omnibus skills with prefix stripped", async () => {
    simulateExtractZip();
    const saga = new UpdateSkillsSaga(mockLogger);
    const result = await saga.run(createSagaInput());

    expect(result.success).toBe(true);
    expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}/test-skill/SKILL.md`)).toBe(
      true,
    );

    const content = vol.readFileSync(
      `${RUNTIME_SKILLS_DIR}/test-skill/SKILL.md`,
      "utf-8",
    );
    expect(content).toContain("name: test-skill");
    expect(content).not.toContain("omnibus-");
  });

  it("context-mill failure is non-fatal", async () => {
    mockExtractZip.mockImplementation(
      async (zipPath: string, extractDir: string) => {
        if (zipPath.includes("context-mill")) {
          throw new Error("context-mill download failed");
        }
        vol.mkdirSync(`${extractDir}/skills/remote-skill`, { recursive: true });
        vol.writeFileSync(
          `${extractDir}/skills/remote-skill/SKILL.md`,
          "# Remote",
        );
      },
    );

    const saga = new UpdateSkillsSaga(mockLogger);
    const result = await saga.run(createSagaInput());

    expect(result.success).toBe(true);
    expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}/remote-skill/SKILL.md`)).toBe(
      true,
    );
  });

  it("fails when no skills found from any source", async () => {
    mockExtractZip.mockImplementation(
      async (_zipPath: string, extractDir: string) => {
        vol.mkdirSync(`${extractDir}/random-dir`, { recursive: true });
        vol.writeFileSync(`${extractDir}/random-dir/README.md`, "nope");
      },
    );

    const saga = new UpdateSkillsSaga(mockLogger);
    const result = await saga.run(createSagaInput());

    expect(result.success).toBe(false);
  });

  it("skips context-mill when URL is empty", async () => {
    mockExtractZip.mockImplementation(
      async (_zipPath: string, extractDir: string) => {
        vol.mkdirSync(`${extractDir}/skills/remote-skill`, { recursive: true });
        vol.writeFileSync(
          `${extractDir}/skills/remote-skill/SKILL.md`,
          "# Remote",
        );
      },
    );

    const input = createSagaInput();
    input.contextMillZipUrl = "";

    const saga = new UpdateSkillsSaga(mockLogger);
    const result = await saga.run(input);

    expect(result.success).toBe(true);
    expect(input.downloadFile).toHaveBeenCalledTimes(1);
  });
});

describe("overlayDownloadedSkills", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("copies skill directories from cache to plugin dir", async () => {
    vol.mkdirSync(`${RUNTIME_SKILLS_DIR}/cached-skill`, { recursive: true });
    vol.writeFileSync(
      `${RUNTIME_SKILLS_DIR}/cached-skill/SKILL.md`,
      "# Cached",
    );
    vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });

    await overlayDownloadedSkills(RUNTIME_SKILLS_DIR, RUNTIME_PLUGIN_DIR);

    expect(
      vol.readFileSync(
        `${RUNTIME_PLUGIN_DIR}/skills/cached-skill/SKILL.md`,
        "utf-8",
      ),
    ).toBe("# Cached");
  });

  it("skips if cache dir does not exist", async () => {
    await overlayDownloadedSkills("/nonexistent", RUNTIME_PLUGIN_DIR);
  });
});

describe("syncCodexSkills", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("copies skill directories to Codex dir", async () => {
    vol.mkdirSync(`${RUNTIME_PLUGIN_DIR}/skills/shipped-skill`, {
      recursive: true,
    });
    vol.writeFileSync(
      `${RUNTIME_PLUGIN_DIR}/skills/shipped-skill/SKILL.md`,
      "# Shipped",
    );

    await syncCodexSkills(RUNTIME_PLUGIN_DIR, CODEX_SKILLS_DIR);

    expect(
      vol.readFileSync(`${CODEX_SKILLS_DIR}/shipped-skill/SKILL.md`, "utf-8"),
    ).toBe("# Shipped");
  });

  it("skips if effective skills dir does not exist", async () => {
    await syncCodexSkills("/nonexistent", CODEX_SKILLS_DIR);
    expect(vol.existsSync(CODEX_SKILLS_DIR)).toBe(false);
  });
});
