import {
  sanitizeBranchName,
  validateBranchName,
} from "@features/git-interaction/utils/branchNameValidation";
import { describe, expect, it } from "vitest";

describe("sanitizeBranchName", () => {
  it("replaces spaces with dashes", () => {
    expect(sanitizeBranchName("my new branch")).toBe("my-new-branch");
  });

  it("replaces multiple consecutive spaces", () => {
    expect(sanitizeBranchName("a  b   c")).toBe("a--b---c");
  });

  it("returns the same string when there are no spaces", () => {
    expect(sanitizeBranchName("feature/foo-bar")).toBe("feature/foo-bar");
  });

  it("handles empty string", () => {
    expect(sanitizeBranchName("")).toBe("");
  });
});

describe("validateBranchName", () => {
  it("returns null for valid branch names", () => {
    expect(validateBranchName("feature/my-branch")).toBeNull();
    expect(validateBranchName("fix-123")).toBeNull();
    expect(validateBranchName("release/v1.0.0")).toBeNull();
    expect(validateBranchName("user/feature")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(validateBranchName("")).toBeNull();
  });

  it("rejects control characters", () => {
    expect(validateBranchName("branch\x00name")).not.toBeNull();
    expect(validateBranchName("branch\x1fname")).not.toBeNull();
    expect(validateBranchName("branch\x7fname")).not.toBeNull();
  });

  it('rejects ".."', () => {
    expect(validateBranchName("branch..name")).not.toBeNull();
  });

  it("rejects forbidden characters", () => {
    for (const char of ["~", "^", ":", "?", "*", "[", "]", "\\"]) {
      expect(validateBranchName(`branch${char}name`)).not.toBeNull();
    }
  });

  it("rejects spaces", () => {
    expect(validateBranchName("branch name")).not.toBeNull();
  });

  it("rejects names starting or ending with a dot", () => {
    expect(validateBranchName(".branch")).not.toBeNull();
    expect(validateBranchName("branch.")).not.toBeNull();
  });

  it('rejects names ending with ".lock"', () => {
    expect(validateBranchName("branch.lock")).not.toBeNull();
  });

  it('rejects "@{"', () => {
    expect(validateBranchName("branch@{0}")).not.toBeNull();
  });

  it('rejects bare "@"', () => {
    expect(validateBranchName("@")).not.toBeNull();
  });

  it('allows "@" as part of a longer name', () => {
    expect(validateBranchName("user@feature")).toBeNull();
  });

  it('rejects "//"', () => {
    expect(validateBranchName("branch//name")).not.toBeNull();
  });

  it("rejects path components starting or ending with a dot", () => {
    expect(validateBranchName("feature/.hidden")).not.toBeNull();
    expect(validateBranchName("feature/name.")).not.toBeNull();
  });

  it("returns a descriptive error message", () => {
    expect(validateBranchName("a..b")).toBe('Branch name cannot contain "..".');
  });
});
