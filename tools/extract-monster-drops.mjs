#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const MONSTER_DIR = "tmp/re-level1/mainscripts/scripts/export/monster";
const OUT = "game/src/data/original/monster-drops.json";

function fail(message) {
  throw new Error(message);
}

function isWordChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch ?? "");
}

function isTokenAt(source, index, token) {
  if (source.slice(index, index + token.length) !== token) {
    return false;
  }
  return !isWordChar(source[index - 1]) && !isWordChar(source[index + token.length]);
}

function findMatching(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  fail(`No matching ${closeChar} for ${openChar} at index ${openIndex}`);
}

function findNextNonWhitespace(source, index) {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) {
    i++;
  }
  return i;
}

function readUntilTopLevelSemicolon(source, start) {
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
    } else if (ch === "(") {
      parenDepth++;
    } else if (ch === ")") {
      parenDepth--;
    } else if (ch === "{") {
      braceDepth++;
    } else if (ch === "}") {
      braceDepth--;
    } else if (ch === "[") {
      bracketDepth++;
    } else if (ch === "]") {
      bracketDepth--;
    } else if (ch === ";" && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      return {
        value: source.slice(start, i).trim(),
        end: i,
      };
    }
  }

  fail(`No top-level semicolon found after index ${start}`);
}

function extractConstructor(source, className) {
  const functionPattern = new RegExp(`public\\s+function\\s+${className}\\s*\\(`);
  const match = functionPattern.exec(source);
  if (!match) {
    fail(`Constructor not found for ${className}`);
  }

  const openParen = source.indexOf("(", match.index);
  const closeParen = findMatching(source, openParen, "(", ")");
  const openBrace = source.indexOf("{", closeParen);
  if (openBrace === -1) {
    fail(`Constructor opening brace not found for ${className}`);
  }
  const closeBrace = findMatching(source, openBrace, "{", "}");
  return source.slice(openBrace + 1, closeBrace);
}

function collectBranchRanges(body) {
  const ranges = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (isTokenAt(body, i, "if")) {
      const openParen = findNextNonWhitespace(body, i + 2);
      if (body[openParen] !== "(") {
        continue;
      }
      const closeParen = findMatching(body, openParen, "(", ")");
      const openBrace = findNextNonWhitespace(body, closeParen + 1);
      if (body[openBrace] !== "{") {
        continue;
      }
      const closeBrace = findMatching(body, openBrace, "{", "}");
      ranges.push({
        start: openBrace + 1,
        end: closeBrace,
        condition: body.slice(openParen + 1, closeParen).trim().replace(/\s+/g, " "),
      });
      continue;
    }

    if (isTokenAt(body, i, "else")) {
      let cursor = findNextNonWhitespace(body, i + 4);
      let condition = "default";

      if (isTokenAt(body, cursor, "if")) {
        const openParen = findNextNonWhitespace(body, cursor + 2);
        if (body[openParen] !== "(") {
          continue;
        }
        const closeParen = findMatching(body, openParen, "(", ")");
        condition = body.slice(openParen + 1, closeParen).trim().replace(/\s+/g, " ");
        cursor = findNextNonWhitespace(body, closeParen + 1);
      }

      if (body[cursor] !== "{") {
        continue;
      }
      const closeBrace = findMatching(body, cursor, "{", "}");
      ranges.push({
        start: cursor + 1,
        end: closeBrace,
        condition,
      });
    }
  }

  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

function activeConditionAt(index, branchRanges) {
  const active = branchRanges.filter((range) => range.start <= index && index < range.end);
  if (active.length === 0) {
    return "default";
  }
  return active[active.length - 1].condition;
}

function parseNumberExpression(raw, label) {
  const trimmed = raw.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  fail(`Expected numeric literal for ${label}, got: ${raw}`);
}

function parseBoolean(raw, label) {
  const trimmed = raw.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  fail(`Expected boolean literal for ${label}, got: ${raw}`);
}

function parseFallList(raw, label) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    fail(`Expected array literal for ${label}, got: ${raw}`);
  }

  let value;
  try {
    value = JSON.parse(trimmed);
  } catch {
    try {
      value = Function(`"use strict"; return (${trimmed});`)();
    } catch (error) {
      fail(`Failed to parse fallList for ${label}: ${error.message}: ${raw}`);
    }
  }

  if (!Array.isArray(value)) {
    fail(`fallList for ${label} did not parse to an array`);
  }

  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.name !== "string" ||
      typeof entry.bigtype !== "string"
    ) {
      fail(`Unexpected fallList entry for ${label}: ${JSON.stringify(entry)}`);
    }
  }

  return value;
}

function extractSimpleAssignments(body, branchRanges, pattern, parser, label) {
  const entries = [];
  let match;
  pattern.lastIndex = 0;

  while ((match = pattern.exec(body)) !== null) {
    const valueStart = pattern.lastIndex;
    const { value, end } = readUntilTopLevelSemicolon(body, valueStart);
    entries.push({
      condition: activeConditionAt(match.index, branchRanges),
      value: parser(value, label),
    });
    pattern.lastIndex = end + 1;
  }

  return entries;
}

function extractFallLists(body, branchRanges) {
  const entries = [];
  const pattern = /this\.(?:protectedParamsObject\.)?fallList\s*=\s*/g;
  let match;

  while ((match = pattern.exec(body)) !== null) {
    const valueStart = findNextNonWhitespace(body, pattern.lastIndex);
    if (body[valueStart] !== "[") {
      fail(`fallList assignment at index ${match.index} does not start with an array`);
    }
    const valueEnd = findMatching(body, valueStart, "[", "]");
    const value = body.slice(valueStart, valueEnd + 1);
    entries.push({
      condition: activeConditionAt(match.index, branchRanges),
      value: parseFallList(value, "fallList"),
    });
    pattern.lastIndex = valueEnd + 1;
  }

  return entries;
}

function collectFallListAssignmentsInSource(source) {
  const assignments = [];
  const pattern = /(this(?:\.\w+)*\.fallList)\s*=\s*/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const valueStart = findNextNonWhitespace(source, pattern.lastIndex);
    if (source[valueStart] !== "[") {
      continue;
    }
    const valueEnd = findMatching(source, valueStart, "[", "]");
    const value = parseFallList(source.slice(valueStart, valueEnd + 1), "source fallList");
    assignments.push({
      lhs: match[1],
      index: match.index,
      valueLength: value.length,
    });
    pattern.lastIndex = valueEnd + 1;
  }

  return assignments;
}

function countEffectiveFallListAssignmentsInSource(source) {
  const assignments = collectFallListAssignmentsInSource(source);
  return assignments.filter((assignment, index) => {
    if (assignment.valueLength !== 0 || assignment.lhs !== "this.fallList") {
      return true;
    }
    return !assignments.slice(index + 1).some((later) => later.lhs === assignment.lhs);
  }).length;
}

function monsterNumber(fileName) {
  const match = fileName.match(/^Monster(\d+)\.as$/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function parseMonsterFile(fileName) {
  const filePath = path.join(MONSTER_DIR, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  const className = fileName.replace(/\.as$/, "");
  const body = extractConstructor(source, className);
  const branchRanges = collectBranchRanges(body);

  return {
    className,
    file: `export/monster/${fileName}`,
    probability: extractSimpleAssignments(
      body,
      branchRanges,
      /this\.protectedParamsObject\.probability\s*=\s*/g,
      parseNumberExpression,
      "probability",
    ),
    stoneFallRate: extractSimpleAssignments(
      body,
      branchRanges,
      /this\.protectedParamsObject\.stoneFallRate\s*=\s*/g,
      parseNumberExpression,
      "stoneFallRate",
    ),
    isBoss: extractSimpleAssignments(body, branchRanges, /this\.isBoss\s*=\s*/g, parseBoolean, "isBoss"),
    gxp: extractSimpleAssignments(
      body,
      branchRanges,
      /this\.protectedParamsObject\.gxp\s*=\s*/g,
      parseNumberExpression,
      "gxp",
    ),
    fallList: extractFallLists(body, branchRanges),
    sourceFallListAssignmentCount: countEffectiveFallListAssignmentsInSource(source),
  };
}

function verifyCount(label, actual, expected, failures) {
  const ok = actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${label}: expected ${expected}, actual ${actual}`);
  if (!ok) {
    failures.push(`${label}: expected ${expected}, actual ${actual}`);
  }
}

function main() {
  const files = fs
    .readdirSync(MONSTER_DIR)
    .filter((file) => /^Monster.*\.as$/.test(file))
    .sort((a, b) => monsterNumber(a) - monsterNumber(b) || a.localeCompare(b));

  const parsed = files.map(parseMonsterFile);
  const monsters = parsed.map(({ sourceFallListAssignmentCount, ...monster }) => monster);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify({ monsters }, null, 2)}\n`, "utf8");

  const failures = [];
  const withFallListAssignment = monsters.filter((monster) => monster.fallList.length > 0);
  const withoutFallListAssignment = monsters.filter((monster) => monster.fallList.length === 0);
  const repeatedFallListSourceFiles = parsed.filter((monster) => monster.sourceFallListAssignmentCount > 1);
  const missingProbability = monsters.filter((monster) => monster.probability.length === 0);
  const missingGxp = monsters.filter((monster) => monster.gxp.length === 0);
  const withStoneFallRate = monsters.filter((monster) => monster.stoneFallRate.length > 0);

  console.log("Monster drops extraction verification");
  verifyCount("scanned Monster*.as files", monsters.length, 85, failures);
  verifyCount("files with at least one constructor fallList assignment", withFallListAssignment.length, 76, failures);
  verifyCount("files with no constructor fallList assignment", withoutFallListAssignment.length, 9, failures);
  console.log(
    `  no constructor fallList assignment files: ${withoutFallListAssignment.map((monster) => monster.file).join(", ")}`,
  );
  verifyCount(
    "files with >1 fallList assignments in source file",
    repeatedFallListSourceFiles.length,
    2,
    failures,
  );
  console.log(
    `  repeated source fallList files: ${repeatedFallListSourceFiles.map((monster) => monster.file).join(", ")}`,
  );
  console.log(
    `  probability not set in constructor: ${
      missingProbability.length === 0 ? "none" : missingProbability.map((monster) => monster.file).join(", ")
    }`,
  );
  console.log(
    `  gxp not set in constructor: ${
      missingGxp.length === 0 ? "none" : missingGxp.map((monster) => monster.file).join(", ")
    }`,
  );
  console.log(
    `  stoneFallRate constructor assignments: ${
      withStoneFallRate.length === 0 ? "none (BaseMonster default only)" : withStoneFallRate.map((monster) => monster.file).join(", ")
    }`,
  );

  if (failures.length > 0) {
    console.error("\nVerification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

main();
