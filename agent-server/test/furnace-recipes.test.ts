import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkMaterials,
  findPlayableRecipe,
  findRecipe,
  listPlayableRecipes,
  listRecipes,
} from "../src/furnace-recipes.js";

test("recipe catalog includes the no-book hackathon starter recipe", () => {
  assert.equal(listRecipes().length, 40);
  assert.deepEqual(findRecipe("starter_whg"), {
    bookFillName: "starter_whg",
    bookName: "新手锻造：尾火棍",
    productFillName: "whg",
    productName: "尾火棍",
    role: "悟空",
    quality: "优 秀",
    materials: [{ fillName: "wptm", name: "檀木", qty: 3 }],
    soulCost: 20,
    requiresBook: false,
  });
  assert.equal(findRecipe("whgzzs")?.productName, "尾火棍");
});

test("starter recipe accepts the same 3 wood and 20 soul shown by the live UI", () => {
  const recipe = findRecipe("starter_whg");
  assert.ok(recipe);
  assert.deepEqual(checkMaterials(recipe, [{ id: "wptm", qty: 3 }], 20), { ok: true });
});

test("live NPC catalog exposes only implemented Wukong starter equipment", () => {
  assert.deepEqual(listPlayableRecipes().map((recipe) => recipe.bookFillName), ["starter_whg"]);
  assert.equal(findPlayableRecipe("whgzzs"), undefined);
  assert.equal(findPlayableRecipe("jmczzs"), undefined);
});

test("checkMaterials reports missing material quantities and soul shortage", () => {
  const recipe = findRecipe("whgzzs");
  assert.ok(recipe);

  assert.deepEqual(checkMaterials(recipe, [{ id: "wptm", qty: 12 }], 199), {
    ok: false,
    missing: ["檀木(wptm) x8"],
    soulShort: true,
  });
});

test("checkMaterials reports soul shortage without material misses", () => {
  const recipe = findRecipe("whgzzs");
  assert.ok(recipe);

  assert.deepEqual(checkMaterials(recipe, [{ id: "wptm", qty: 20 }], 199), {
    ok: false,
    missing: [],
    soulShort: true,
  });
});

test("checkMaterials accepts when all materials and soul are present", () => {
  const recipe = findRecipe("whgzzs");
  assert.ok(recipe);

  assert.deepEqual(checkMaterials(recipe, [{ id: "wptm", qty: 20 }], 200), { ok: true });
});
