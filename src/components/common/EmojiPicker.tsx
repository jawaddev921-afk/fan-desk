"use client";
import { useState } from "react";
import { SmileIcon } from "./icons.tsx";

const EMOJIS = "\u{1F600} \u{1F602} \u{1F60A} \u{1F60D} \u{1F618} \u{1F609} \u{1F60F} \u{1F917} \u{1F970} \u{1F60E} \u{1F61C} \u{1F972} \u{1F975} \u{1F608} \u{1F525} \u{2728} \u{1F4AB} \u{2764}\u{FE0F} \u{1F495} \u{1F496} \u{1F497} \u{1F49C} \u{1F90D} \u{1F44B} \u{1F44D} \u{1F64C} \u{1F64F} \u{1F4AA} \u{1F351} \u{1F352} \u{1F353} \u{1F349} \u{1F378} \u{1F377} \u{1F37E} \u{2615} \u{1F319} \u{2600}\u{FE0F} \u{1F31E} \u{1F339} \u{1F33A} \u{1F984} \u{1F98B} \u{1F431} \u{1F436} \u{1F3D6}\u{FE0F} \u{2708}\u{FE0F} \u{1F3CB}\u{FE0F} \u{1F4F8} \u{1F3B6}".split(" ");

/** A smiley button that opens a grid of emojis; `onPick` gets the one that was clicked. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="emoji">
      <button type="button" className="ghost" aria-label="Pick an emoji" aria-expanded={open} onClick={() => setOpen(!open)}><SmileIcon /></button>
      {open && (
        <div className="emoji-grid" role="group" aria-label="Emojis">
          {EMOJIS.map((e) => <button type="button" key={e} className="ghost" onClick={() => onPick(e)}>{e}</button>)}
        </div>
      )}
    </span>
  );
}
