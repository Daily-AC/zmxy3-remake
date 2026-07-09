import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchCraftRecipeIntent, type NpcBrainCallbacks } from "../src/brain.js";

test("recipe craft callback is a safe pass-through even for bogus recipe ids", () => {
  let seenRecipeId = "";
  const callbacks: NpcBrainCallbacks = {
    onSay: () => {},
    onGiveItem: () => {},
    onSetGoal: () => {},
    onCraftItem: () => {},
    onCraftRecipe: (recipeId) => {
      seenRecipeId = recipeId;
    },
  };

  assert.doesNotThrow(() => dispatchCraftRecipeIntent("not-a-real-recipe", callbacks));
  assert.equal(seenRecipeId, "not-a-real-recipe");
});
