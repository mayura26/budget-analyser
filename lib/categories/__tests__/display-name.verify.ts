import assert from "node:assert/strict";
import {
  formatCategoryForAI,
  formatCategoryOptionPlainText,
  parseCategoryDisplayName,
} from "../display-name";

assert.deepEqual(
  parseCategoryDisplayName("Activities (dining, events, hobbies)"),
  {
    title: "Activities",
    subtext: "dining, events, hobbies",
  },
);
assert.deepEqual(parseCategoryDisplayName("Groceries"), {
  title: "Groceries",
  subtext: null,
});
assert.deepEqual(parseCategoryDisplayName("  Income (salary / primary)  "), {
  title: "Income",
  subtext: "salary / primary",
});
assert.deepEqual(parseCategoryDisplayName(""), {
  title: "",
  subtext: null,
});

assert.equal(
  formatCategoryForAI(1, "Activities (dining)", "Enjoyment", "expense"),
  "1: Activities — details: dining — group: Enjoyment — type: expense",
);
assert.equal(
  formatCategoryForAI(2, "Groceries", "Essentials", "expense"),
  "2: Groceries — details: — — group: Essentials — type: expense",
);
assert.equal(
  formatCategoryOptionPlainText("Activities (dining)"),
  "Activities — dining",
);
assert.equal(formatCategoryOptionPlainText("Groceries"), "Groceries");

console.log("display-name.verify.ts: ok");
