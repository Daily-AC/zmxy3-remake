import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMaterials, findRecipe, listRecipes } from "../src/furnace-recipes.js";

test("recipe catalog contains the 39 deterministic furnace recipes", () => {
  assert.equal(listRecipes().length, 39);
  assert.equal(findRecipe("whgzzs")?.productName, "尾火棍");
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
