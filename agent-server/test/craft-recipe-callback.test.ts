import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchCraftRecipeIntent, type NpcBrainCallbacks } from "../src/brain.js";

test("recipe craft callback only forwards recipes implemented in the live game", () => {
  let seenRecipeId = "";
  const callbacks: NpcBrainCallbacks = {
    onSay: () => {},
    onGiveItem: () => {},
    onSetGoal: () => {},
    onCraftRecipe: (recipeId) => {
      seenRecipeId = recipeId;
    },
  };

  assert.equal(dispatchCraftRecipeIntent("not-a-real-recipe", callbacks), false);
  assert.equal(seenRecipeId, "");
  assert.equal(dispatchCraftRecipeIntent("jmczzs", callbacks), false);
  assert.equal(seenRecipeId, "");
  assert.equal(dispatchCraftRecipeIntent("starter_whg", callbacks), true);
  assert.equal(seenRecipeId, "starter_whg");
});
