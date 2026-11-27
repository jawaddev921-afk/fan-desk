import assert from "node:assert/strict";
import { test } from "node:test";
import { BIO_SECTIONS, bioPercent, cleanBio } from "../../../src/features/creator/schema.ts";

test("only known questions are kept, in the right shape; empty answers are dropped", () => {
  assert.deepEqual(
    cleanBio({ name: " Sam ", gender: "Female", persona: "made up", evil: "x", languages: ["English", " "], services: ["Selling a VIP package", "nope"], city: "  ", slang: ["wrong shape"] }),
    { name: "Sam", gender: "Female", languages: ["English (US)"], services: ["Selling a VIP package"] },
  );
});

test("each kind of answer is checked: a date is a date, a slider is one of its stops, a measure is a number with a unit, a switch is on or nothing", () => {
  assert.deepEqual(cleanBio({ birth_date: "1999-01-11", punctuation: "Casual", height: "5'7 ft", weight: "130 lb", assign_fan_lists: "on" }), { birth_date: "1999-01-11", punctuation: "Casual", height: "5'7 ft", weight: "130 lb", assign_fan_lists: "on" });
  assert.deepEqual(cleanBio({ birth_date: "yesterday", punctuation: "Loud", height: "<script>", assign_fan_lists: "off" }), {});
});

test("the strategy and country lists have their options, and Beta ones are marked", () => {
  const chatting = BIO_SECTIONS.find((s) => s.id === "chatting")!.fields.find((f) => f.key === "strategy")!;
  assert.ok(chatting.options!.length >= 6 && chatting.beta!.every((b) => chatting.options!.includes(b)) && chatting.options!.every((o) => chatting.details![o]));
});

test("percent counts only the required questions", () => {
  const required = BIO_SECTIONS.flatMap((s) => s.fields).filter((f) => f.required);
  assert.equal(bioPercent({}), 0);
  assert.equal(bioPercent({ fav_color: "green", pets: "a dog" }), 0); // optional answers do not move it
  assert.equal(bioPercent({ name: "Sam" }), Math.round(100 / required.length));
});

test("the writing and explicitness sliders and the yes/no answers are checked like the other kinds", () => {
  assert.deepEqual(cleanBio({ writing_level: "Mixed", explicitness: "Extra Dirty", tattoos: "Yes: a clover on my wrist", piercings: "No" }), { writing_level: "Mixed", explicitness: "Extra Dirty", tattoos: "Yes: a clover on my wrist", piercings: "No" });
  assert.deepEqual(cleanBio({ writing_level: "Wild", tattoos: "Maybe", piercings: "Yes: " }), {});
});

test("an answer saved under the older wording still finds its option, nothing is lost on the next save", () => {
  assert.deepEqual(cleanBio({ strategy: "Aggressive: leads toward sales more often", capitalization: "Proper names only", punctuation: "casual", services: ["Dick ratings", "Custom content"] }), { strategy: "Aggressive", capitalization: "Proper Names", punctuation: "Casual", services: ["Dick rating"] });
});

test("the persona list has its ten personas, each with a line of detail", () => {
  const persona = BIO_SECTIONS.find((s) => s.id === "chatting")!.fields.find((f) => f.key === "persona")!;
  assert.equal(persona.options!.length, 10);
  assert.ok(persona.options!.every((o) => persona.details![o]));
});

test("country and time zone: the list matches the form (country code order, the US by time zone name, standard UTC offsets), and a saved choice is kept", () => {
  const country = BIO_SECTIONS.find((s) => s.id === "personal")!.fields.find((f) => f.key === "country")!;
  assert.ok(country.options!.length > 300);
  assert.equal(country.extra!["United States of America (Eastern Time)"]!.meta, "UTC-5");
  assert.equal(country.extra!["United States of America (Alaska Time)"]!.meta, "UTC-9");
  assert.equal(country.extra!["Ukraine (Europe/Kyiv)"]!.meta, "UTC+2");
  assert.deepEqual(cleanBio({ country: "United States of America (Eastern Time)", languages: ["English (US)", "Klingon"], traveling: "No" }), { country: "United States of America (Eastern Time)", languages: ["English (US)"], traveling: "No" });
});

test("gender, relationship and orientation are dropdowns, and the pets answer is limited to 150 characters in the form", () => {
  const f = (k: string) => BIO_SECTIONS.find((s) => s.id === "personal")!.fields.find((x) => x.key === k)!;
  assert.equal(f("gender").dropdown, true);
  assert.equal(f("relationship").kind, "select");
  assert.equal(f("pets").max, 150);
});

test("a reply is fixed in code: the fan's @username is dropped and Lowercase capitalization is applied", async () => {
  const { polishReply } = await import("../../../src/features/creator/schema.ts");
  assert.equal(polishReply("Hey there, @preview! I'm good, just chilling.", { username: "preview", lowercase: false }), "Hey there! I'm good, just chilling.");
  assert.equal(polishReply("Hey @Jordan_99, what's up?", { username: "jordan_99", lowercase: true }), "hey, what's up?");
  assert.equal(polishReply("Moose is my dog's name. What about you?", { username: null, lowercase: false }), "Moose is my dog's name. What about you?");
  assert.equal(polishReply("Hi!", { username: "x.y", lowercase: true }), "hi!");
});
