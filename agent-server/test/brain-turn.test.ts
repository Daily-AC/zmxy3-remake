import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNpcTurn } from "../src/brain.js";

test("chat turns cannot mint custom equipment outside the furnace transaction", () => {
  const turn = parseNpcTurn(JSON.stringify({
    say: "炉火未开，先去炼丹炉择材。",
    craft_item: {
      id: "free-item",
      name: "凭空法宝",
      rarity: 3,
      desc: "不经过材料事务",
      effects: [{ type: "stat", stat: "atk", value: 200 }],
    },
  }));

  assert.deepEqual(turn, { say: "炉火未开，先去炼丹炉择材。" });
});

test("chat turns retain validated original-recipe intents", () => {
  assert.deepEqual(
    parseNpcTurn('{"say":"开炉。","craft_recipe":{"recipeId":"starter_whg"}}'),
    { say: "开炉。", craft_recipe: { recipeId: "starter_whg" } },
  );
});
