#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

// MyEquipObj construction calls transValue(), which maps quality to a fixed total
// sale value, then setValue(total) randomizes value1 = ceil(random()*100) and
// value2 = total - value1. The saleValue emitted here is that deterministic
// quality-tier total, not the runtime-randomized value1/value2 split.

const SOURCE = "tmp/re-level1/mainscripts/scripts/my/AllEquipment.as";
const OUT = "game/src/data/original/equipment.json";

const QUALITY_SALE_VALUE_TABLE = {
  "粗 糙": 10,
  "普 通": 20,
  "优 秀": 40,
  "精 良": 80,
  "史 诗": 160,
  "邪 灵": 320,
  "魂 器": 640,
  "传 说": 1280,
  "神 器": 2560,
};

const STAT_NAMES = [
  "ehp",
  "emp",
  "eatt",
  "edef",
  "ecrit",
  "emiss",
  "eahp",
  "eamp",
  "eatblood",
  "magicdef",
  "deephit",
];

const EXPECTED_SOURCE_ARRAY_COUNTS = {
  normalEquipment: 9,
  otherEquipment: 67,
  wpEquipment: 120,
  sutraEquipment: 10,
  sellEquipment: 12,
};

const EXPECTED_OTHER_TYPE_COUNTS = {
  zbwq: 27,
  zbfj: 24,
  zbsp: 10,
  zbtx: 6,
};

const EXPECTED_OTHER_USER_COUNTS = {
  "悟空": 12,
  "唐僧": 12,
  "八戒": 12,
  "沙僧": 15,
  "": 16,
};

const EXPECTED_OTHER_QUALITY_COUNTS = {
  "优 秀": 12,
  "精 良": 11,
  "史 诗": 13,
  "传 说": 10,
  "邪 灵": 10,
  "魂 器": 9,
  "神 器": 2,
};

function fail(message) {
  throw new Error(message);
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

  fail(`No matching ${closeChar} found for ${openChar} at index ${openIndex}`);
}

function splitTopLevel(input) {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

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
    } else if (ch === "," && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }

    if (parenDepth < 0 || braceDepth < 0 || bracketDepth < 0) {
      fail(`Negative nesting depth while splitting arguments near: ${input.slice(Math.max(0, i - 30), i + 30)}`);
    }
  }

  const last = input.slice(start).trim();
  if (last.length > 0) {
    parts.push(last);
  }

  return parts;
}

function parseString(raw, label) {
  if (!/^"(?:\\.|[^"\\])*"$/.test(raw)) {
    fail(`Expected quoted string for ${label}, got: ${raw}`);
  }
  return JSON.parse(raw);
}

function parseNumber(raw, label) {
  const trimmed = raw.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    fail(`Expected numeric literal for ${label}, got: ${raw}`);
  }
  return Number(trimmed);
}

function parseStat(raw, label) {
  const trimmed = raw.trim();
  const randomMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\+\s*Math\.round\s*\(\s*Math\.random\s*\(\s*\)\s*\*\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (randomMatch) {
    return {
      base: Number(randomMatch[1]),
      rand: Number(randomMatch[2]),
    };
  }
  const unroundedRandomMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\+\s*Math\.random\s*\(\s*\)\s*\*\s*(-?\d+(?:\.\d+)?)$/);
  if (unroundedRandomMatch) {
    return {
      base: Number(unroundedRandomMatch[1]),
      rand: Number(unroundedRandomMatch[2]),
    };
  }
  const unitRandomMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\+\s*Math\.random\s*\(\s*\)$/);
  if (unitRandomMatch) {
    return {
      base: Number(unitRandomMatch[1]),
      rand: 1,
    };
  }
  const rangeFirstRandomMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\+\s*(-?\d+(?:\.\d+)?)\s*\*\s*Math\.random\s*\(\s*\)$/);
  if (rangeFirstRandomMatch) {
    return {
      base: Number(rangeFirstRandomMatch[1]),
      rand: Number(rangeFirstRandomMatch[2]),
    };
  }
  return parseNumber(trimmed, label);
}

function parseObject(raw, label) {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return {};
  }
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    fail(`Expected object literal for ${label}, got: ${raw}`);
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    try {
      return Function(`"use strict"; return (${trimmed});`)();
    } catch (fallbackError) {
      fail(
        `Failed to parse object literal for ${label}: JSON ${error.message}; JS ${fallbackError.message}: ${raw}`,
      );
    }
  }
}

function parseParam22(raw, label) {
  if (raw === undefined) {
    return {};
  }

  const trimmed = raw.trim();
  if (trimmed === "this.initRondomPro()") {
    return { sourceExpression: "this.initRondomPro()" };
  }

  return parseObject(trimmed, label);
}

function sourceArrayForVar(sourceVar) {
  if (sourceVar.startsWith("normal")) {
    return "normalEquipment";
  }
  if (/^otherEquip\d+$/.test(sourceVar)) {
    return "otherEquipment";
  }
  if (/^wpEquip\d+$/.test(sourceVar)) {
    return "wpEquipment";
  }
  if (/^sutra(?:\d+|1000)$/.test(sourceVar)) {
    return "sutraEquipment";
  }
  if (/^fashionEquip\d+$/.test(sourceVar)) {
    return "sellEquipment";
  }
  fail(`Unknown source variable prefix: ${sourceVar}`);
}

function extractCalls(source) {
  const calls = [];
  const assignmentPattern = /this\.(\w+)\s*=\s*new\s+MyEquipObj\s*\(/g;
  let match;

  while ((match = assignmentPattern.exec(source)) !== null) {
    const sourceVar = match[1];
    const openIndex = assignmentPattern.lastIndex - 1;
    const closeIndex = findMatching(source, openIndex, "(", ")");
    const argText = source.slice(openIndex + 1, closeIndex);
    calls.push({ sourceVar, argText });
    assignmentPattern.lastIndex = closeIndex + 1;
  }

  return calls;
}

function parseItem(call) {
  const args = splitTopLevel(call.argText);
  if (args.length !== 21 && args.length !== 22) {
    fail(`${call.sourceVar} expected 21 or 22 constructor args, got ${args.length}`);
  }

  const stats = {};
  for (let i = 0; i < STAT_NAMES.length; i++) {
    stats[STAT_NAMES[i]] = parseStat(args[7 + i], `${call.sourceVar}.${STAT_NAMES[i]}`);
  }

  const quality = parseString(args[5], `${call.sourceVar}.quality`);
  if (!(quality in QUALITY_SALE_VALUE_TABLE)) {
    fail(`${call.sourceVar} has unknown quality ${JSON.stringify(quality)}`);
  }

  const param21 = parseObject(args[20], `${call.sourceVar}.param21`);

  return {
    sourceArray: sourceArrayForVar(call.sourceVar),
    sourceVar: call.sourceVar,
    showid: parseNumber(args[0], `${call.sourceVar}.showid`),
    ename: parseString(args[1], `${call.sourceVar}.ename`),
    fillName: parseString(args[2], `${call.sourceVar}.fillName`),
    type: parseString(args[3], `${call.sourceVar}.type`),
    user: parseString(args[4], `${call.sourceVar}.user`),
    quality,
    color: parseString(args[6], `${call.sourceVar}.color`),
    stats,
    aStrengthen: parseObject(args[18], `${call.sourceVar}.aStrengthen`),
    instruction: parseString(args[19], `${call.sourceVar}.instruction`),
    elevel: param21.elevel ?? 0,
    eupdata: param21.eupdata ?? 0,
    num: param21.num ?? null,
    param22: parseParam22(args[21], `${call.sourceVar}.param22`),
    saleValue: QUALITY_SALE_VALUE_TABLE[quality],
  };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item[key];
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function countByGetter(items, getter) {
  const counts = {};
  for (const item of items) {
    const value = getter(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function verifyCount(label, actual, expected, failures) {
  const ok = actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${label}: expected ${expected}, actual ${actual}`);
  if (!ok) {
    failures.push(`${label}: expected ${expected}, actual ${actual}`);
  }
}

function verifyCounts(label, actualCounts, expectedCounts, failures) {
  console.log(label);
  for (const [key, expected] of Object.entries(expectedCounts)) {
    const actual = actualCounts[key] ?? 0;
    const displayKey = key === "" ? "\"\" (universal)" : key;
    const ok = actual === expected;
    console.log(`  ${ok ? "✓" : "✗"} ${displayKey}: expected ${expected}, actual ${actual}`);
    if (!ok) {
      failures.push(`${label} ${displayKey}: expected ${expected}, actual ${actual}`);
    }
  }
}

function main() {
  const source = fs.readFileSync(SOURCE, "utf8");
  const calls = extractCalls(source);
  const items = calls.map(parseItem);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    `${JSON.stringify({ qualitySaleValueTable: QUALITY_SALE_VALUE_TABLE, items }, null, 2)}\n`,
    "utf8",
  );

  const failures = [];
  console.log("Equipment extraction verification");
  verifyCount("total MyEquipObj calls/items", items.length, 218, failures);
  verifyCounts(
    "counts by sourceArray",
    countBy(items, "sourceArray"),
    EXPECTED_SOURCE_ARRAY_COUNTS,
    failures,
  );

  const otherItems = items.filter((item) => item.sourceArray === "otherEquipment");
  verifyCounts("otherEquipment by type", countBy(otherItems, "type"), EXPECTED_OTHER_TYPE_COUNTS, failures);
  verifyCounts("otherEquipment by user", countBy(otherItems, "user"), EXPECTED_OTHER_USER_COUNTS, failures);
  verifyCounts(
    "otherEquipment by quality",
    countByGetter(otherItems, (item) => item.quality),
    EXPECTED_OTHER_QUALITY_COUNTS,
    failures,
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
