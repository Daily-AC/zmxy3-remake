import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEffects, validateCraftedItem } from "../src/craft-validate.js";

test("stat value above limit is clamped, not rejected", () => {
  const { effects, clamped, rejectedCount } = validateEffects([
    { type: "stat", stat: "atk", value: 999 },
  ]);
  assert.equal(rejectedCount, 0);
  assert.equal(clamped, true);
  assert.equal(effects.length, 1);
  assert.equal(effects[0], effects[0]); // narrows for TS below
  assert.deepEqual(effects[0], { type: "stat", stat: "atk", value: 50 });
});

test("each stat has its own clamp ceiling", () => {
  const { effects } = validateEffects([
    { type: "stat", stat: "hp", value: 9999 },
    { type: "stat", stat: "mp", value: 9999 },
    { type: "stat", stat: "crit", value: 9999 },
  ]);
  assert.deepEqual(
    effects.map((e) => (e.type === "stat" ? e.value : null)),
    [200, 200, 0.5],
  );
});

test("negative stat values are clamped up to 0", () => {
  const { effects, clamped } = validateEffects([{ type: "stat", stat: "def", value: -30 }]);
  assert.equal(clamped, true);
  assert.deepEqual(effects[0], { type: "stat", stat: "def", value: 0 });
});

test("onHit chance and power are independently clamped", () => {
  const { effects, clamped } = validateEffects([
    { type: "onHit", effect: "burn", chance: 1, power: 999 },
  ]);
  assert.equal(clamped, true);
  assert.deepEqual(effects[0], { type: "onHit", effect: "burn", chance: 0.5, power: 30 });
});

test("effects beyond the cap of 3 are truncated, not merged or errored", () => {
  const raw = [
    { type: "stat", stat: "atk", value: 5 },
    { type: "stat", stat: "def", value: 5 },
    { type: "stat", stat: "hp", value: 5 },
    { type: "stat", stat: "mp", value: 5 },
    { type: "stat", stat: "crit", value: 0.1 },
  ];
  const { effects, truncated, clamped } = validateEffects(raw);
  assert.equal(effects.length, 3);
  assert.equal(truncated, true);
  assert.equal(clamped, false); // the first 3 were all within range
});

test("exactly 3 effects is not truncated", () => {
  const raw = [
    { type: "stat", stat: "atk", value: 5 },
    { type: "stat", stat: "def", value: 5 },
    { type: "stat", stat: "hp", value: 5 },
  ];
  const { effects, truncated } = validateEffects(raw);
  assert.equal(effects.length, 3);
  assert.equal(truncated, false);
});

test("illegal stat name is rejected outright, not clamped into a legal one", () => {
  const { effects, rejectedCount } = validateEffects([
    { type: "stat", stat: "luck", value: 10 },
  ]);
  assert.equal(effects.length, 0);
  assert.equal(rejectedCount, 1);
});

test("illegal onHit effect name is rejected outright", () => {
  const { effects, rejectedCount } = validateEffects([
    { type: "onHit", effect: "poison", chance: 0.1, power: 5 },
  ]);
  assert.equal(effects.length, 0);
  assert.equal(rejectedCount, 1);
});

test("unknown effect type is rejected", () => {
  const { effects, rejectedCount } = validateEffects([{ type: "explode", value: 10 }]);
  assert.equal(effects.length, 0);
  assert.equal(rejectedCount, 1);
});

test("non-array effects input degrades to empty, not a throw", () => {
  const { effects, rejectedCount, truncated } = validateEffects(undefined);
  assert.equal(effects.length, 0);
  assert.equal(rejectedCount, 0);
  assert.equal(truncated, false);
});

test("validateCraftedItem clamps rarity into 1-3 and appends the note when effects were clamped", () => {
  const item = validateCraftedItem({
    id: "huoyan-zhang",
    name: "烈焰法杖",
    rarity: 99,
    desc: "一把裹着火焰的法杖",
    effects: [{ type: "stat", stat: "atk", value: 999 }],
  });
  assert.equal(item.rarity, 3);
  assert.match(item.desc, /丹炉火候不足/);
  assert.equal(item.effects[0].type, "stat");
});

test("validateCraftedItem leaves desc untouched when nothing needed clamping", () => {
  const item = validateCraftedItem({
    id: "huoyan-zhang",
    name: "烈焰法杖",
    rarity: 2,
    desc: "一把裹着火焰的法杖",
    effects: [{ type: "stat", stat: "atk", value: 10 }],
  });
  assert.equal(item.desc, "一把裹着火焰的法杖");
  assert.equal(item.rarity, 2);
});

test("validateCraftedItem fills in safe defaults for missing id/name/desc", () => {
  const item = validateCraftedItem({});
  assert.equal(item.kind, "equip");
  assert.equal(typeof item.id, "string");
  assert.ok(item.id.length > 0);
  assert.equal(item.name, "无名法宝");
  assert.equal(item.rarity, 1);
  assert.equal(item.effects.length, 0);
});
