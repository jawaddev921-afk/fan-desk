# Jazz realism plan: making Try Jazz behave like Izzy, and better

Target file: `docs/plan/jazz-realism.md`. This directory is new (`docs/` has `adr`, `research`, `ui`). The consent model and the auto-send question should also get ADRs in `docs/adr/`. This is a plan only and changes no code. It merges three designer lenses (fast visible realism, voice quality, safety/consent) and the review pass.

Status tags: **docs** = SuperCreator first-party page, **video** = screen recording or screenshot, **inferred** = our reading. Provider facts come from `docs/research/ofmapi-endpoints.md`. Izzy parity evidence comes from `docs/research/supercreator-creator-gaps.md`, which dates from 2026-11-20 and is partly stale. Refreshing its status is step 0 of M0. "Sim" means the Try Jazz simulator (`src/features/creator/components/autopilot.ts` and `TryWriter.tsx`).

**Scope cut, stated plainly.** Flow statistics, Merge-node joins, roles and analytics are deferred (see sections 3 and 13). Super Mass and Expired Fans are in scope as draft-only outbound modalities (M12).

---

## 1. Goal, and what "real like a creator" means, measurably

**Goal.** Every Jazz draft, in Try Jazz first and in the real inbox later, should read like one specific creator who:
- knows the fan,
- knows what time it is,
- sells at a sensible moment and only what is on her menu,
- never repeats herself,
- never lies about facts or about being an AI.

A person approves every draft. Jazz is not an auto-sender.

"Real" is defined by measurable properties. **All targets below are initial guesses.** M1 step 0 measures the current baseline on 20 to 50 cases, and targets are then set relative to it.

| Property | Measure | Initial target |
|---|---|---|
| Voice match | Length ratio (draft words over her real reply words), emoji rate, lowercase share, question-end share, openers, against her own creator-verified replies | Median length ratio 0.8 to 1.25. Emoji and lowercase within 10 points. Question share within 15 points |
| Pacing | Offers in the first 3 fan turns. A second offer while one is open. "how much?" continuing the open offer | 0, 0, and at least 95% |
| Non-repetition | Share of drafts whose 3-gram overlap with her last 30 sends exceeds 0.5. Share copying a retrieved example above 0.7 | Under 3%, and 0 |
| Grounding | Drafts with an ungrounded creator fact, or an off-menu price shown as normal | 0 (release gate) |
| Identity honesty | Drafts that deny being an AI or claim human-only facts | 0 (release gate) |
| Hard-rule integrity | Bot question, tip, PPV purchase, big spender and safety-floor signals reaching a human. Price holds | 100% (release gate) |
| Fan protection | After "stop", "can't afford it", or distress: no further sell draft | 100% (release gate) |
| Human acceptance | Share sent as is or with a light edit (edit distance under 40%), by stage, with sampled reading audits | At least 60% after the style milestones |
| Blind check | Client rates 10 transcripts (5 Jazz, 5 her real) | Advisory only |
| Cost and latency | Calls per draft, input tokens per draft, estimated cost per 1000 drafts on `claude-sonnet-5-5`, p50 and p95 latency per model | One call plus at most one retry. Budget set in M4 from the measured baseline. Prompt-cache hit on the static prefix is verified from `usage` |

Code-only assertions (stage, price, escalation, identity, fan protection) must pass at 100% on any model. They are checked on canned drafts through the fake AI (see M1). Voice scores are judged on Claude, because the local qwen2.5:3b cannot be trusted for voice.

---

## 2. Where Try Jazz is today (honest)

**The real writer path.**
- Two entry points call the same writer: `previewReply` (Try Jazz, wired from `assistant/handlers.ts` `previewHandler`) and `processReplyJob` (worker).
- Both call `writerContext(accountId, focus)` and then `decideReply`. Output goes through `polishReply`.
- The prompt is `systemPrompt(s, profile)` plus `transcript(history, fan)` in `assistant/service.ts`.
- `buildWriterContext` (`creator/schema.ts`) is capped at 14000 characters, or 3200 on Ollama with 3 examples. The cut is a tail slice, so Train examples and scripts are cut first.

**Checks that already exist (generalise, do not rebuild).** All of these are in `assistant/service.ts` unless noted:
- `decideReply`, with one retry via `VOICE_NUDGE` / `repeatNudge`.
- `soundsLikeSupport` and `repeatsEarlier(reply, history)`, which checks only the fan-chat history.
- `priceNotOnMenu`, `asksForFacts`, `isBotQuestion`, `closestAnswer`, `MAX_MESSAGE_CHARS`.
- `polishReply` (emoji, lowercase, `@username`, length).
- `mostRelevant` and `trainExamples`, both module-private in `creator/schema.ts`. `closestAnswer` calls `mostRelevant`.
- `herTypicalWords` and `widelySent` in `inbox/queries.ts`. `herTypicalWords` already filters on `messages.source = 'human'`.

**What the model sees about a fan.**
- Only name, username and lifetime spend, plus the last 30 messages.
- No timestamps, no gaps, no clock, no media or price notes, no tenure, no purchases, no tier or tags.
- `ai_summary` is one overwritten line and is never fed back.

**Try Jazz fakes the fan.**
- `previewReply` builds a Fan with `fan_id: 'preview'` and spend 0. History timestamps are `now - (n-i)*60_000`, so the model sees 1-minute gaps.
- `previewHandler` takes `{turns, followUp}` and is limited to 20 calls per 10 minutes.
- So the simulator and the worker drift apart.

**Two engines.**
- `autopilot.ts` (445 lines, pinned by `tests/unit/creator/autopilot.test.ts`) runs in the browser. It implements, in a seeded pure `Sim`:
  - the virtual clock and active hours,
  - bumps, follow-up nudges, silent PPV and unsend,
  - flows, flood mute, custom-request escalation and targeting,
  - `fanTags` and `personalPrice` (the "PriceGuard" idea is only a comment inside it).
- The real worker (`runWorkerTick`, `processReplyJob`) has none of these. It only has `replyDebounceMs`, `targetingVerdict`, the 8-replies-per-hour cap, `STALE_MS` and the hold checks. `flooding` also exists in `creator/service.ts`, so check for a second copy before moving it.
- The Advanced Settings schema comment already says "nothing sends on a timer yet".

**Rules only in the prompt, unverified in code.**
- No invented facts.
- Avoid words and topics.
- One open offer at a time.

**Offers.**
- The product chip is attached by product-name substring match in `autopilot.ts` `deliver()`. The model never returns a product id.
- The latest change added bump-before-nudge ordering and "continue the open offer" notes (`marks()`), but only in the simulator.

**Stored but never used by the writer.**
- Bio fields: `language_notes`, `assign_fan_lists`, `collect_info`, `ai_pricing`, `unavailable_social`.
- Persona and strategy descriptions: only their labels are sent.
- Products: `bundle`, `media[]` and tags-as-matching never reach the prompt.
- Bump messages, flows, Advanced Settings, and script trigger or step state.
- Live-update `startsAt`. `buildWriterContext` input in `creator/service.ts` (about line 289) filters only on `endsAt`.

**Fan data.**
- `fans` has `total_spend`, `intent`, `score`, `tier`, `mode`, `handoff_reason`, `ai_summary`, `last_paid_at`, `last_message_at`, `subscribed_at`, `stats_at`.
- There is no purchase table (only `[tip $N]` and `[PPV purchase $N]` system messages), no notes, no tags and no per-fan offer state.
- `recordPayment` does not add to `total_spend`.
- `messages` already has `direction` and `source`. The `outbox` table has only id, account_id, fan_id, text, source, status, of_message_id, error, attempts, next_attempt_at, created_at, updated_at. `approveDraft(id, editedText)` overwrites `text` and sets status `queued`.
- `lib/events.ts` is a closed typed `Events` map (`fan:message`, `fan:typing`, `fan:human`, `account:sent`, `connection:removed`).

**Provider facts that limit us.**
- OFMAPI messages expose only `isFromMe`, so creator, chatter and past Jazz-draft text cannot be told apart.
- `sendMessage` sends only `{text}`, and its response shape and Idempotency-Key behaviour are unverified.
- Online, subscription and post-like webhooks are not registered and have never been received.
- The `/transactions` endpoint has no client method.

**Local model.** qwen2.5:3b takes 30 to 110 seconds per draft and is weak. No Claude key yet (target default `claude-sonnet-5-5`).

---

## 3. Izzy parity table

Statuses come from the research maps (source: `docs/research/supercreator-creator-gaps.md` unless noted; rows tagged stale need a refresh in M0 step 0). Milestones refer to section 7. Names that already exist are shown so this is not read as greenfield.

| Behaviour | Evidence | Our status | Closes in |
|---|---|---|---|
| Reads the whole chat before each reply | docs | partial (30 messages, no gaps) | M0, M8 (rolling summary) |
| Persona, explicitness, avoid words and topics | docs | have | M4 (wire the unused fields) |
| Answers only from bio, catalog and stories, never invents | docs | have (prompt only; `asksForFacts`, `closestAnswer`) | M4 `validateDraft` |
| Per-fan knowledge (tenure, spend, buy rate, renew, PPV timeline, lists, notes) | docs | partial | M0 (context pack), M7 (memory) |
| PPV catalog with exclusivity 1 to 5, price | docs | partial | M3 |
| Personalized AI pricing | docs | partial (sim `personalPrice`) | M3 |
| Reply delay range | docs | partial (sim only) | M5c (simulator and draft metadata only) |
| Follow-up nudge when the fan goes quiet | docs | partial (sim only) | M9 |
| Silent-fan PPV | inferred | partial (sim only) | M3, M9 |
| Unsend unanswered message | video | partial (sim only; provider endpoint unknown) | stays sim-only |
| Bumps by trigger, random pick, `{name}` fallback, recency guard | docs | partial (sim only) | M9 (as drafts) |
| Bump carries a PPV and Izzy continues that offer | inferred | partial | M3 |
| Flows (entry rules, nodes, exits, goal) | video | partial (sim; `FlowBuilder`, `FlowDrawers`, `FlowScreen`, `FlowStats` exist as display) | M9 (shared engine and arbitration) |
| Merge node really joins branches | video | partial | deferred (scope cut) |
| Flow stats and goal attribution | video | missing | deferred to after M10 (scope cut) |
| Scripts (trigger, steps, once per fan, expiry, exit) | docs | partial (text only) | M3 |
| Escalation (spend, custom request, tip, PPV, bot question, restricted topic) | docs | have | M2 (typed categories) |
| "AI escalations" list and Urgent Priority tag | video | partial | M2 |
| Targeting and exclusion lists | docs | have (`targetingVerdict`) | already |
| Rule-based fan lists | video | partial | not a Jazz-realism item |
| Automatic fan tags | docs | partial (sim `fanTags`) | M7 |
| Manual tags, notes, preferences, "Fill with AI" | docs | missing | M7 |
| PPV timeline per fan | docs | missing | M7 (`fan_purchases`, `fan_offers`) |
| Sent-before memory | docs | partial | M3 (sim), M7 (`fan_offers`) |
| Active hours with timezone | docs | partial (sim only) | M0 (shared), M9 (worker) |
| Catch-up when back on schedule | docs | partial | M9 |
| Global and per-chat pause | video | partial | not a Jazz-realism item |
| Review before send during onboarding | docs | have (draft-first) | already |
| Moderation (off-platform, external payments, meetings) | docs | partial | M2 safety floor, M4 |
| Live updates, max 7, auto-expire | docs | have | M4 (honour `startsAt`, expiry in the facts list) |
| Train answers teach voice | video | have (partial scenario set) | M5b |
| Voice learned from her chat history | docs | partial (`herTypicalWords`: length and emojis only) | M5a/M5b |
| Thumbs and "Helpful?" feedback | video | missing | M6 |
| "Write with Izzy", "Make it more" chips, Short/Medium/Long and Implicit/Neutral/Explicit | video | missing | M6 (explicitness is a creator-level ceiling, not a per-draft chip) |
| Fan Insights panel and hot-buyer card | video | missing | M7 |
| "Sent by chatter" author per message | video | missing | M5a (extend `messages.source`) |
| Learns from conversions (marketing claim, no method) | docs | missing | M6 logs outcomes only; see section 13 |
| Message Library reuse of saved messages | inferred | missing (`features/library` not wired to Jazz) | M5b (retrieval candidate), M3 (attachment) |
| Expired Fans win-back, Super Mass | video | display only | M12 (drafts only) |
| Roles, analytics, Izzy Monitor | video/docs | missing | out of scope (scope cut) |
| Disclosure: Izzy does not say it is AI | docs | have (ours routes a sincere bot question to a human, stricter) | already; M4 adds an identity-claim validator |
| Promo/spam DM handling | docs | missing | M2 (cheap rule, never delete) |

---

## 4. The wiring map

One engine. Rules live as pure, browser-safe functions in `creator/schema.ts` (no zod; the checker allows only the five role files at the feature top, so use `// ---- topic` sections there or files under `components/`). They are imported by both `autopilot.ts` and the server. File paths are under `src/features/` unless noted.

**Refactor rule for M0.** `verdict`, `personalPrice` and `fanTags` currently take `Sim`/`SimConfig` (browser types). Each is first re-parameterised to take plain arguments (spend, spend history, now, Advanced, fan facts) and then moved. `autopilot.ts` keeps thin `Sim` wrappers. The existing `autopilot.test.ts` is the parity oracle and must stay green throughout.

**Layering rule.** Order is auth < accounts < inbox < library < creator < assistant. `inbox` cannot read creator-owned data (list members, products, Advanced). So the fan context builder lives in `creator/service.ts` (it already imports inbox queries `getFan`, `recentMessages`, `widelySent`). Plain DB reads (purchases, memory, messages) stay in `inbox/queries.ts`. The pure `TurnContext` type and a builder over plain inputs live in `creator/schema.ts`. Feedback from `approveDraft` (assistant, the highest feature) calls `creator/service.ts` functions directly, which is legal. No new `Events` entries are needed. If one is ever added, it goes in `lib/events.ts` and is registered in the owning feature.

| Platform feature | What Jazz receives | Pipeline stage | Files |
|---|---|---|---|
| Bio, chatting sliders, persona, strategy | Static identity block. Persona and strategy become a sentence ("Rapport mode: never sell" also blocks the offer gate) | 4, 3 | `creator/schema.ts` `buildWriterContext`, `PERSONAS` |
| Bio, unused fields (`collect_info`, `language_notes`, `ai_pricing`, `unavailable_social`) | `collect_info` becomes "if natural, ask his X", only when engaged. `unavailable_social` becomes a "not available" line. `language_notes` goes into the style block. **`ai_pricing` vs `personalPrice`:** `ai_pricing` (Bio strategy) sets the band, and `personalPrice` (per-fan history) moves the price inside that band. When they disagree, the Bio band wins and the menu price is the hard ceiling | 4, 6, 3 | `creator/schema.ts` |
| `assign_fan_lists` | Strategy per fan list resolved in the offer gate (M3). The list-assignment suggestion is stored in the sim and shown in the why panel | 3 | `creator/schema.ts`, `creator/service.ts` |
| Bio limits (avoid words, topics, red lines, services) | Prompt list plus a code validator | 4, 6 | `buildWriterContext`, `validateDraft` |
| Bio `not_creator_reply` | Bot-question answer used instead of a hand-off only when the creator wrote one, and never through the deflection route | 2 | `assistant/service.ts` `isBotQuestion` |
| Train answers and custom samples | Few-shot pool (3 on Ollama, 8 to 12 on Claude), ranked by overlap and stage | 5 | `creator/schema.ts` `rankExamples` (built on `mostRelevant`; `closestAnswer` updated in the same change) |
| Her real sent replies | Same pool, only creator-verified, only with consent, redacted | 5 | new `creatorPairs` in `inbox/queries.ts` (built on the `widelySent` logic), called from `creator/service.ts` `writerContext` |
| Message Library (`features/library`) | Retrieval candidates and allowed attachments, with `{name}` fill and the same copy penalty | 3, 5 | `library/queries.ts`, `creator/service.ts` |
| Style statistics | Numeric style rules and post-check thresholds | 5, 6 | new `computeStyle` in `creator/schema.ts`, `creator_style` row (extends `herTypicalWords`) |
| Products | The one allowed product (id, name, price, media count from the vault at draft time with a stale guard, one-line description). The menu is not dumped when the gate is closed | 3, 4 | `creator/service.ts` `writerContext` returns structured offers; `offerGate` |
| Product price and `ai_pricing` | `personalPrice` moved into shared code | 3 | `creator/schema.ts` |
| Bump messages | Open-offer note on the fan and the follow-up pick. Bumps never go to the model as a menu | 3, 8 | `autopilot.ts` `startBump`, later `fan_offers` |
| Scripts | Code matches the trigger, tracks a per-fan step pointer, enforces once-per-fan, expiry and exit. The prompt gets "step 2 of S" | 3 | `creator/schema.ts` `scriptMatch` |
| Flows | The same shared step function, so the worker can later create flow messages as drafts. No flow text reaches the model | 8 | `autopilot.ts` `startFlows`, `stepRun` moved to shared pure code |
| Fan Lists, `creator_list_members` | List names in the context and in the targeting gate | 1, 2 | `creator/service.ts`, `targetingVerdict` |
| Advanced settings | Clock block ("her local time, active or away"), follow-up timing, quiet window | 1, 7, 8 | `isOpen`/`nextOpen`/`localParts` moved to `creator/schema.ts` |
| Targeting | Pre-model verdict, typed category | 2 | `creator/service.ts` `targetingVerdict`, shared `preModelVerdict` |
| CRM: fan row | Fan context pack | 1 | `creator/service.ts` `buildFanContext`, plain reads from `inbox/queries.ts` |
| Fan memory | Up to 6 relevant confirmed rows, source-tagged | 1, 4 | `fan_memory` (phase B) |
| Purchases | "He bought X, 3 days ago, $15", unlock and ignore counts, last PPV state | 1 | `fan_purchases` written in `inbox/service.ts` `recordPayment` |
| Live updates | "What she is doing right now" block, filtered on both `startsAt <= now` and `endsAt`. An "away" update feeds the unavailable line and active hours | 4 | `creator/service.ts` `writerContext` (one-line fix, done in M0) |
| Escalation | Typed category plus free-text reason, stored as a prefix in `fans.handoff_reason` in phase A | 2, 9 | `creator/schema.ts` `ESCALATION_CATEGORIES`, `assistant/service.ts` |
| Message media and price | Transcript notes like "[locked PPV $15, 1 media, not opened]" read from `messages.media[].price` (`StoredMedia.price`) | 1, 4 | `assistant/service.ts` `transcript`, `inbox/queries.ts` `recentMessages` |
| Draft feedback | Approved finals and corrections enter her example pool (account-owner approvals only), account-scoped | 10 | `assistant/service.ts` calls `creator/service.ts`; `approveDraft` writes `original_text` in the same UPDATE |

---

## 5. The decision pipeline

One function, `draftFor(accountId, fanCtx, history, clock)`, in `assistant/service.ts`, used by `previewReply`, `processReplyJob` and the backtest. **Principle: code decides what and when; the model decides only how it is worded.**

**Arbitration (one speaker per fan per tick).** When several features want to speak, the priority is fixed and shared by sim and worker:
1. human mode or safety-floor stop
2. a person typing or replying in OnlyFans
3. escalation
4. open-offer continuity
5. script step
6. flow node
7. bump
8. follow-up
9. silent PPV

Default for a fan reply during a running flow: the flow pauses and Jazz replies (**inferred**; Izzy's behaviour is unrecorded). Tests are added in M3 and M9.

**Stage 0. Capability and consent gate.**
- A pure `capabilityOf(account, flags, consent)` returns tier 0 (off) or tier 1 (draft only, the default). A tier 2 "reminder draft" is defined in M9 and is also never sent without a person.
- `send_mode: auto` is refused on save unless a future decision exists. A one-time migration step or notice moves existing accounts with `send_mode = auto` to draft, with a visible notice.
- LLM role: none.

**Stage 1. Fan context pack.**
- `buildFanContext(...)` returns a plain object:
  - tenure, spend band, tier, last purchase, PPV sent/unlocked/ignored counts,
  - list names, the open offer, minutes since the fan's last message and hers,
  - local time and day part, whether she is in active hours.
- Try Jazz builds the same shape from `SimFan` through an adapter, and `ctx` is passed in the preview body (zod, size-capped: spend, tenure, virtual `now`, per-turn timestamps).
- The transcript gets gap markers when the gap exceeds 30 minutes, plus media and price notes and an author label.
- LLM role: none.

**Stage 2. Hard pre-guards.**
- One ordered `preModelVerdict()`: capability gate, `fan.mode == human`, targeting, tip / PPV / big spender state, a person replied in OnlyFans, promo/DM-spam rule, `isBotQuestion` (kept, plus a multilingual set), `asksForFacts`, custom-order pattern, **safety floor**, active hours with `respondWhenBack`, flood, the 8-per-hour cap, `STALE_MS`.
- It returns `{action: skip|human|delay, category, reason}` with typed `ESCALATION_CATEGORIES`.
- **Safety floor behaviour (sticky).** Minor signals, self-harm, off-platform contact or payment, and meeting requests set `fan.mode` to human and **block every automated draft** (reply, bump, follow-up, silent PPV, flow, mass) for that fan until a person clears it. No draft is produced meanwhile. The inbox shows a banner and an Urgent tag. Self-harm gets a distinct highest-priority alert with a short note to the human on how to respond. A conversation with a minor signal is never written to memory. In phase A the category is stored as a fixed prefix in `fans.handoff_reason`. A unit test asserts that M9 never creates a draft for such a fan.
- **Fan protection (no-sell) signals.** "stop" or "unsubscribe", "can't afford it", distress or compulsion, or two declines. After these, no bump, follow-up or PPV draft is created. Unanswered automated messages are capped (default 2 follow-ups, then silence).
- LLM role: none. A model signal (for example a sincere bot-question flag) is only a second net and never overrides a code rule.

**Stage 3. Stage detector and offer gate.**
- Pure `chatStage`: `new | warming | engaged | offer_open | awaiting_pay | cooling | handed_off`.
- Pure `offerGate(ctx, products)` returns `{mayOffer, product?, mustContinueOfferId?, reason}`. Rules:
  - no offer in the first N fan turns (default 3),
  - none on low-intent, hostile or no-sell turns,
  - none while an offer is open,
  - a minimum gap since the last offer and a per-fan daily cap,
  - never a repeat (sent keys),
  - exclusivity and progression respected,
  - "Rapport mode" blocks offers,
  - price from `personalPrice` inside the Bio `ai_pricing` band, capped by the menu price.
- Script triggers are matched in code with a per-fan step pointer.
- LLM role: none. The result becomes one prompt sentence: "You may bring up X", "Do not mention any offer", or "Continue the open offer: ...".

**Stage 4. Prompt assembly.**
- Order: role and honesty rules, then the static identity card (cache-friendly), then a closed "facts you may use" list (including live updates inside their dates) and an "unknown to you" list, then her style numbers and examples, then a short dynamic "Right now" block (target under 600 characters), then the transcript, then a 5-line rules recap and the output format.
- The dynamic block is never truncated. On Ollama, truncation drops low-priority blocks in order instead of the current blind tail slice.
- Rules that code now enforces (menu prices, one open offer) are removed from the prompt to save tokens.
- **Data minimisation.** By default the model gets the first name or a pseudonym instead of the username, and no spend amount unless the stage needs it. This is a setting.
- LLM role: none.

**Stage 5. Model call.**
- One structured call plus at most one retry.
- Ollama keeps the current shape. Claude adds optional fields, behind a model check: `messages[]` (suggested bubbles), `offer_product_id`, `fan_signal` (asked_price, upset, wants_creator, custom_request, identity_question, none), `facts[] {text, source_message_id, confidence}`, `facts_used[]`.
- LLM role: voice writer, intent and needs_human classifier, optional fact extractor. It does not choose products, prices or stage. If `fan_signal` or the draft touches identity, the result is forced to needs_human.

**Stage 6. Post-processing and validators.**
- `validateDraft()` generalises the existing retry in `decideReply` (`soundsLikeSupport`, `repeatsEarlier`, `priceNotOnMenu`, `MAX_MESSAGE_CHARS`) into one typed failure list:
  - **identity claim** (denies being an AI or claims human-only facts): hard failure,
  - ungrounded claim, unknown product or price,
  - avoid word, topic or red line,
  - assistant tells (longer list than today),
  - length and emoji against style numbers,
  - n-gram repetition (`repeatsEarlier` extended from fan-chat history to her last 30 sends) and near-copy of an example (overlap above about 0.7),
  - an offer mentioned when `mayOffer` is false,
  - a product other than the allowed one.
- `polishReply` is extended with deterministic fixes (punctuation level, laughter style, nickname swap). A fix never adds a factual claim.
- Retry budget: one retry with a typed nudge list. If a hard failure remains, the draft is created with a hold reason or goes to a person. It is never shown as a normal draft. `profile.fallback` (`closestAnswer`) is used for style failures and labelled as such.
- Every steered redraft (M6) runs `validateDraft` again.
- LLM role: retry only.

**Stage 7. Cadence (metadata only).**
- `toBubbles(reply, typical, rng)` and `typingSeconds` are pure functions that return **metadata only**. A `check:boundaries` rule forbids them importing the send path (`outbox` send code, `fansapi`/`ofmapi` clients).
- They split by sentence into 1 to 3 bubbles (about 25% two, 5% three, seeded by `Sim.rng`) and never split a price from its product. `typingSeconds` is reading time plus about 0.4 s per word, clamped to the `Advanced.delay` window.
- In Try Jazz this runs on the virtual clock with a typing indicator, and every such effect is labelled "Simulated".
- In production it produces only draft text plus a "suggested bubbles / suggested time" that a person confirms. No typing indicator, simulated delay or bubble timing is ever sent to a fan unless a person approved that specific draft and the send. There is no bubble job kind in `reply_jobs` (its primary key is `(account_id, fan_id)`).
- Disclosure wording (section 12 item 12) is written before any production use of cadence.
- LLM role: none.

**Stage 8. Offer and bump attachment by id.**
- The chip, price and media note are attached for the id chosen in stage 3, not by name-substring match. The name match stays as a fallback only when the id is absent.
- The open offer is `Sim.openOffer` in the sim and `fan_offers` for real. Media counts are read from the vault at draft time, with a stale guard.
- LLM role: words the pitch for the handed product.

**Stage 9. Escalation display.**
- Each escalation carries `{category, text, at}` and is grouped in the side panel. A fan in human mode shows the Urgent Priority tag.
- Creator-approved deflection lines (`creator_items` kind `sample`, category `Deflection`) answer non-hard cases without calling the model. **Deflection never covers identity.** The topics "are you real", "are you a bot", "AI" and "who am I talking to" are excluded. A sample matching an identity pattern is rejected on save. Deflection runs only after `preModelVerdict` has cleared the bot-question check.
- LLM role: none for the deflection route.

**Stage 10. Feedback and learning.**
- Thumbs, reason chips, original vs final text and edit distance are stored. Only the account owner's (or a creator-role user's) approved finals enter her pool. Chatter approvals are stored as feedback only. Rejected drafts never enter the pool.
- All feedback and eval text is redacted (see section 6) and has a retention period.
- LLM role: none.

---

## 6. Data model changes

**Phasing, corrected.** Phase A (M0 to M4, plus M5c as simulator metadata) adds no migration. Anything that persists new state is phase B: M5a/M5b, M6 persistence, M7, M9 and M12 storage. Phase B is split into several `NNN_*.sql` files so one failure does not block server start. The latest existing is `013_advanced.sql`, so the next is 014. Never edit a file that has run.

**Phase A, no migration:**
- `Sim` gains `openOffer {productId|bumpId, price, mediaCount, at}`, `notes[]`, `exampleUse[]`.
- Escalation category is stored as a fixed prefix in `fans.handoff_reason`.
- `creator_items` gets `feedback {draft, final, vote, reason, stage, productId, at}`. Add `'feedback'` to `Kind` (the closed `z.enum` in `creator/handlers.ts`), `ItemKind` and `ItemData` (`creator/types.ts`) and `ITEM_DATA`. Exclude it from `itemsOf` list UIs and the "copy from another creator" import, and cap it by retention. `Deflection` is a category of kind `sample`. Check `isBuiltInSample` and the `TRAIN` categories first.
- New browser-safe types and pure functions in `creator/schema.ts`: `TurnContext`, `Stage`, `EscalationCategory`, `OfferGate`, `chatStage`, `offerGate`, `preModelVerdict`, `toBubbles`, `validateDraft`, `computeStyle`, `rankExamples`, `redact`.
- `previewHandler` body gets an optional, size-capped `ctx` object, and a separate higher limit (or a batch endpoint, owner-only) for the scenario suite. The 20 per 10 min limit stays for normal use. `previewReply` returns `{category, stage, guards[], examplesUsed[], retry, fallback, bubbles[]}`.
- **Sandbox fan for Try Jazz.** In phase A all state stays in `Sim` and is passed in `ctx`, so nothing is written to real fan tables. If phase B needs a persisted fan, it uses a flagged sandbox fan (`fans.is_sandbox`) excluded from sync, inbox lists, purge counts and analytics.

**Phase B, migrations 014 to 020** (all keyed by `account_id`, RLS on with no policy). Each states its owning feature, which registers its own deletion on `connection:removed` (the pattern `assistant/service.ts` uses at about line 388). `creator` has no handler today, so one is added. `deleteAccountFans` stays in `inbox` and covers only inbox tables. A unit test fails if a table with an `account_id` column has no delete handler.
- **014 consent and message source (inbox/creator).**
  - `account_consent` (memory, learn_from_chats, bump_drafts, send_names_to_model, accepted_at, version). The consent flag is created here, not in M5.
  - **No `messages.author` column.** Extend the existing `messages.source` vocabulary (add `chatter`, `jazz_draft`; `human` keeps meaning "unverified, maybe hers"). Add a nullable `creator_verified BOOLEAN`. Update the `herTypicalWords`, `recentPpvs` and `widelySent` filters in the same step.
- **015 style and examples (creator).** `creator_style` (account_id primary key, JSONB stats). `her_examples` (fan_text, her_text, stage, words, has_emoji, source history | approved | train), stored only after `redact()`.
- **016 fan state (creator).** `fan_state` (stage, open_offer, script_runs, sent_keys, flow_runs, last_offer_at). `fan_offers` (product_id, source, price, media_count, status open | bought | ignored | expired). `fan_purchases` (kind tip | ppv | sub, amount, of_message_id, product_id, at), written in `inbox/service.ts` `recordPayment`. This also fixes `recordPayment` not adding to `total_spend`.
- **017 memory (creator).** `fan_memory` (kind enum, text, source_message_id or 'human', source ai | human, confidence, pinned, status auto | confirmed | rejected) and `fan_summary` (rolling, up to a message id).
  - Default off by consent.
  - Retention is not longer than the message purge, or rows are purged with the fan.
  - A per-fan "forget this fan" action deletes memory, summary, offers, purchases, notes and feedback.
  - Auto rows are not used in prompts until confirmed or at least listed in "what Jazz learned".
  - A code-side denylist (regex plus kind enum) rejects sensitive rows before insert (health, minors, real name or address, finances, other platforms), independent of the model.
- **018 outbox (assistant).** `outbox.original_text` (written at draft creation and in the same UPDATE as approval, backfill NULL), `intent`, `model`, `stage`, `decision` (as_is | light_edit | rewrite | rejected), `edit_distance`, `thumb`, `reject_reason`, `decided_by`, `decided_at`, `facts_used`. The `usage` link to `fan_id`/`outbox_id` is deferred to M8, because `recordUsage(accountId, model, input, output)` has several call sites.
- **019 escalation (inbox).** `fans.handoff_code`, replacing the phase A prefix.
- **020 eval (creator).** `creator_eval_cases` (golden | taught | regression, redacted, with retention) and later `eval_runs`/`eval_results`.
- `draft_group` and `not_before` are deferred to M9. `not_before` is only a reminder time for when a draft appears (`next_attempt_at` is not reused). It never gates sending. The send worker must ignore any row whose status is `draft`, enforced by a code assertion and a test.

**Provider data (read-only first).** Add `transactions`, `fansTop` and `subscriptionHistory` to `lib/integrations/ofmapi.ts`. Webhook additions (users.online, subscription, likes) need approval (section 12). Keep online events only as `last_seen_at` with no history, and add them to the 30-day webhook-id purge.

**Redaction.** `redact()` is a tested pure function. It strips names, usernames, handles, numbers, locations and links. It is applied before storing `her_examples`, feedback or eval text, and before any text from fan X appears in fan Y's prompt.

---

## 7. Milestones

Order and dependencies below. Each can be tested in Try Jazz (`TryWriter.tsx`) unless stated. Canned drafts come from the demo fake AI in unit tests only: the user asked (2026-11-25) to remove the "Mock replies" switch from Try Jazz, so there is no stub toggle in the UI. Deterministic assertions (`validateDraft`, `offerGate`) run on it. Real-model checks are advisory, with a per-test time budget on Ollama (30 to 110 s per draft).

### M0. Shared engine and context pack (foundation)
- **Deliverable:**
  - Step 0: refresh `docs/research/supercreator-creator-gaps.md` status.
  - Re-parameterise, then move, the pure rules out of `autopilot.ts` into `creator/schema.ts`: `verdict`, `isOpen`/`nextOpen`/`localParts`, `flooding` (dedupe with `creator/service.ts`), `CUSTOM`, `personalPrice`, `fanTags`. Also move the pure "what is due now" step function (bump, follow-up, silent PPV given fan state, settings, now). Keep thin `Sim` wrappers.
  - Add `TurnContext`, `buildFanContext` (in `creator/service.ts`) and `ctxOf(sim)`.
  - `previewReply` accepts `ctx` instead of faking a Fan.
  - Add the "Right now" block, gap markers and the `startsAt <= now` live-update filter.
  - Add a "why" side panel showing the exact state block sent, and an always-visible "Simulation. Real sending to fans is off" banner on the Autopilot sim.
- **Effort:** M-L. **Depends on:** none. The existing `autopilot.test.ts` is the parity oracle.
- **Test in Try Jazz:** set the fan to 400 USD and 40 days, then jump +1 day. The why panel shows day part, "went quiet 1 d" and tier, and the draft greets by time of day or acknowledges the gap. Unit-test `buildFanContext` for timezone and active hours. Add a parity test that the sim verdict and the server verdict match on a recorded event script.

### M1. Backtest harness and scenario suite (build early)
- **Deliverable:**
  - Step 0: measure the baseline on 20 to 50 cases and set section 1 targets relative to it.
  - Pure scenario data (`creator/components/scenarios.ts`), about 8 scripted fans: silent after hello, "how much?" after a bump, flirty then asks to meet, bot question (several languages), tip then returns, rude, haggling, 3-day gap. Each has code assertions.
  - A `node --test` file that runs them through the shared rules with a stub writer.
  - A "Run all" button against the live preview endpoint, using the separate higher limit, reporting pass/fail per assertion and latency.
  - Replay ("Replay from a real chat") is restricted to messages she or the user marks as hers, or Train answers, until `creator_verified` exists. It is gated behind the `learn_from_chats` consent flag, which moves to this milestone. It pseudonymises input, runs on Ollama by default, and needs an explicit opt-in click, with a count of messages that will leave the machine, to run on Claude. Reports stay on the user's screen. No chat or draft text goes to logs or CI.
- **Effort:** M. **Depends on:** M0.
- **Test in Try Jazz:** Run all shows 100% on code-only assertions (stub writer). Voice score is a separate advisory column.

### M2. Guards, escalation categories, safety floor
- **Deliverable:** `preModelVerdict` with typed `ESCALATION_CATEGORIES`, used by `processReplyJob`, `previewReply` and `autopilot.ts`. Safety-floor patterns with the sticky stop behaviour (stage 2), multilingual bot-question variants, the promo/DM-spam rule, fan-protection no-sell signals, the capability gate that refuses `send_mode: auto` (plus the existing-account notice), and the category stored in `fans.handoff_reason` with a fixed prefix. Grouped escalation panel, Urgent Priority tag and inbox banner. Deflection samples with the identity exclusion and save-time pattern check.
- **Effort:** M. **Depends on:** M0.
- **Test in Try Jazz:** "are you a bot?" in several languages, "meet me tomorrow", a tip, a custom-video request, a minor mention, a self-harm mention, "stop". Each lands in the panel with the right category, the model is not called, and the AI stops. A deflection line for "are you real" is refused on save.

### M3. Stage detector, offer gate, code-chosen product, open-offer continuity, arbitration
- **Deliverable:** `chatStage`, `offerGate`, `Sim.openOffer`, product chip by id, one offer at a time, no offer in the first turns, "Continue the open offer" line, `personalPrice` shared with the Bio `ai_pricing` rule, `assign_fan_lists`, script trigger matching with a step pointer, silent-PPV pick reusing `offerGate`, media count from the vault with a stale guard, the arbitration order, Message Library attachments.
- **Effort:** L. **Depends on:** M0, M2.
- **Test in Try Jazz:** (A) "hey" then "what do you have?" on turn 1 gives no chip and no price. After 3 turns Jazz may offer one product with the exact chip. (B) A bump follow-up then "yes how much?" repeats the same offer. (C) With an offer open, "anything else?" gives no second offer. (D) A script runs once per fan and exits on `exitOn`. (E) Rapport mode never offers. (F) "I can't afford it" ends selling. (G) A flow reply pauses the flow. Unit tests in `tests/unit/stage.test.ts`.

### M4. Prompt assembly, unused Bio fields, validators, anti-repetition
- **Deliverable:** layered prompt builder with priority-aware truncation and the data-minimisation setting. Wire `collect_info`, `language_notes`, `unavailable_social`, persona and strategy text, live-update expiry and `startsAt` into the facts list. Generalise `decideReply`'s retry into `validateDraft` (stage 6, including the identity-claim check). Extend `repeatsEarlier` to her last 30 sends and examples. One bounded retry, hold-or-hand-off on a hard failure, a "fallback used" label, and tokens per draft shown in the why panel.
- **Effort:** L. **Depends on:** M3.
- **Test in Try Jazz:** deterministic part: canned drafts through the stub writer with an avoid word, a banned phrase, a wrong price and an AI denial are each rejected with the right typed failure. Advisory part, on the real model: send the same fan line 4 times and drafts never contain the word or reuse an opener. Ask for her city, age or schedule where the bio is empty, and the draft must deflect without a made-up detail or show a hold. Ask "how much for the set" and the price equals the product's. Use a live update with a virtual-clock jump to check expiry.

### M5a. Consent, source flag, style statistics
- **Deliverable:** migrations 014 and 015. Consent screen stating which fans' text goes to which AI provider, with exact wording. Per-range, previewed, sampled-review `creator_verified` marking plus a "not me" mark (no bulk confirm). `computeStyle`, `creator_style`, and the `redact()` function with tests.
- **Effort:** M. **Depends on:** M1, provider data-flow ADR (release gate, section 12).
- **Test:** with consent off, no history-derived style is used. The account-scoping test passes for the new tables.

### M5b. Retrieval of her examples
- **Deliverable:** `creatorPairs` (new, built on `widelySent` logic), `rankExamples` (built on `mostRelevant`, with `closestAnswer` updated in the same change), excluding mass sends, bumps and priced messages, with a copy penalty. Message Library candidates. A "what Jazz learned" review in the Train tab. The Train tab states which provider receives the text.
- **Effort:** M. **Depends on:** M5a, M4.
- **Test in Try Jazz:** with consent off, the examples block holds only Train answers. With consent on, retrieved redacted pairs appear and chatter or Jazz-draft messages never do. Run the M1 replay before and after on the same 50 to 100 cases. A unit test proves account B cannot see account A's pairs, and fan X's identifying text never appears in fan Y's prompt.

### M5c. Cadence (simulator and draft metadata only)
- **Deliverable:** `toBubbles`, `typingSeconds` (stage 7) and a typing indicator in Try Jazz labelled "Simulated". No `reply_jobs` change. The boundary rule forbids a send-path import.
- **Effort:** S-M. **Depends on:** M0. Production use waits for the disclosure wording.
- **Test in Try Jazz:** turn off "skip message delay": replies arrive as 1 to 2 short bubbles with uneven delays, and the same seed gives the same split.

### M6. Draft review loop (Write with Jazz, steering, feedback)
- **Deliverable:** migration 018. Keep `outbox.original_text`; decision and edit distance; thumbs and reason chips (too long, too salesy, off voice, invented, repeated). "Make it more" chips and Short/Medium/Long toggles redraft through the same validators. An explicitness ceiling is a creator-level Bio setting described in neutral wording, with the minor/non-consent/illegal floor code-enforced and not relaxable by any chip. Regenerate rejects the older draft. An "outdated" badge appears when a newer fan message arrived. Teach Jazz corrections become redacted Train samples and eval cases (owner approvals only). `approveDraft` calls `creator/service.ts` directly. Draft text is redacted from logs and eval output.
- **Effort:** M. **Depends on:** M4, M5b.
- **Test in Try Jazz:** thumbs-down plus a corrected text creates a Train sample and a feedback item, and the same fan line later retrieves it. Each chip's redraft still passes the validators. A chatter approval is not added to the pool. Approving a draft is the only code path that moves a row from `draft` to `queued` (unit test).

### M7. Fan memory, purchases and Insights panel
- **Deliverable:** migrations 016 and 017. `fan_purchases` written in `recordPayment`. `fan_memory` with sources, the denylist, consent default off, retention and "forget this fan". A rolling summary job (background, Claude only). An Insights panel (preferences, notes, purchase history, hot-buyer reason, renew state) in `app/(dashboard)`. Up to 6 confirmed rows in the state block.
- **Effort:** L. **Depends on:** M0, M5a, provider data-flow gate, a Claude key for auto-extraction. Tester-typed notes work without it.
- **Test in Try Jazz:** the sandbox fan (or `Sim` state via `ctx`) carries seeded memory. A later chat recalls it once and only when it fits. Delete the row and it never reappears. "Do you remember my dog?" when none was said gives a non-invented answer. A denylisted category is rejected before insert.

### M8. Claude-only extras
- **Deliverable:** `offer_product_id`, `fan_signal`, `facts[]`, `messages[]` behind a model check so Ollama is unaffected. 8 to 12 examples. A rolling summary in the state block. An LLM-judge rubric (not the writer's own model family as sole judge, calibrated on about 50 human labels). The `usage` link to `fan_id`/`outbox_id`, and cost per draft in the why panel.
- **Effort:** M. **Depends on:** M1, M7, `ANTHROPIC_API_KEY`, the provider data-flow gate.
- **Test in Try Jazz:** same scenarios on Ollama vs Claude, comparing pass rate, voice score and tokens. Facts appear in a "what Jazz learned" list with delete buttons, and none appears without a source message id.

### M9. Worker automations as drafts (bump, follow-up, silent PPV, flows, active hours)
- **Deliverable:** a `runWorkerTick` step that calls the shared "what is due now" function with real timestamps and the fan's `fan_state`, then creates drafts (reasons such as "Bump: Online", "Follow-up") through the shared engine. It covers flows with the arbitration order. `not_before` is only the time a draft appears in the inbox. The `draft` rows are never read by the send worker. Bump-before-nudge ordering sits behind a switch. It needs the user's decision before registering `users.online`, subscription and like webhooks.
- **Effort:** L. **Depends on:** M3, M0, written consent. **Never queued, never auto-sent.**
- **Test in Try Jazz:** a "Run worker tick on this sim fan" button calls the same server function with the sim's state and returns the due drafts. Real timer behaviour is verified only through this dry-run. The parity test compares the shared function outputs on a recorded event script. A +3 days run shows no double bump and no repeated follow-up. A due bump appears in the inbox as a draft tagged "bump". A sticky-stopped fan gets none.

### M10. Long-run and drift evaluation (optional)
- **Deliverable:** an AI-fan persona option in `TryWriter.tsx` and a nightly 100+ turn script scoring early vs late turns, memory recall, repetition and rule compliance. It runs under a separate rate limit and is owner-only.
- **Effort:** M. **Depends on:** M1, M3, M7.
- **Test in Try Jazz:** a "3 days, 120 turns" scenario, with a drift chart of voice score at turn 5 vs turn 100.

### M11. Consented real-world step (only if the user approves)
- **Deliverable:** an ADR under `docs/adr/`, then one test-fan send to verify the send response shape and Idempotency-Key. Only then extend `sendMessage` with `price`, `media`, `lockedText`, add an "unknown" reconcile step and request-level idempotency on reply. Auto-send and unsend stay out of scope until separately decided.
- **Effort:** M. **Depends on:** written user consent and a test fan the user owns.
- **Test in Try Jazz:** not testable there by design. Staged check with the user watching the first sends, and a repeated Approve click must not double send.

### M12. Outbound modalities as drafts (Expired Fans win-back, Super Mass)
- **Deliverable:** draft text only, through the same `offerGate`, `validateDraft` and `targetingVerdict`, never queued. A "campaign" event on the virtual clock hits the sim fan. Mass text is tagged `widelySent` so M5b excludes it from voice learning. Only Super Mass wizard step 1 has been recorded, so the rest stays display-only and labelled inference.
- **Effort:** M. **Depends on:** M3, M4.
- **Test in Try Jazz:** a campaign arrives as a draft with a price on the menu. A fan in human or no-sell state is excluded.

**Ordering.** M0 is first because it is small and the backtest needs the shared context. M1 follows immediately so every later change is measured. The "visible wins" are M0 to M4 plus M5c, all demonstrable on Ollama with no Claude key. Given the refactor of tested code, plan for more than two weeks.

---

## 8. Evaluation

- **Backtest on her real stored chats.** For each fan message she really answered (creator-verified only), rebuild only what was known at that time (messages before it, with `created_at` as the clock), call `draftFor`, and compare with her real reply. This is a "replay", not training. Scores: length ratio, emoji, lowercase, question share against `creator_style`, word and n-gram overlap, the `validateDraft` checks, and an optional pairwise LLM judge (positions swapped, rubric of voice, no assistant tells, no invented facts, right stage).
- **Baseline first.** Measure the current writer on 20 to 50 cases before any change, then set targets relative to it.
- **Judge calibration.** Validate the judge against about 50 human labels. Use a different model family from the writer as sole judge. The judge is advisory. The code assertions are the gate.
- **Scenario suite (M1).** About 8 scripted fans with code assertions, run in `node --test` with a stub provider and via "Run all" against the live endpoint. Model-output checks are advisory with a time budget.
- **CI gate.** No change may lower hand-off, identity-honesty, fan-protection or price-hold behaviour. The hard-rule metrics are release gates.
- **Metrics, by stage:** voice distribution gaps; repetition and copy rate; assistant-tell rate before and after post-processing; retry and fallback rate and latency p50/p95 per model; tokens and cost per draft; offer correctness; acceptance (as-is, light edit, rewrite, reject) by stage with sampled reading audits; memory recall and false-fact rate; drift (turn 100 vs turn 5).
- **Privacy in evaluation.** Reports stay local. No chat or draft text in logs, CI or docs. Eval cases are per account, redacted, retained for a limited time and never exported across accounts.

---

## 9. What goes beyond Izzy

These are cheap and are our own choices (inference: Izzy's mechanisms are undocumented, so "beyond" means relative to what is publicly described).

- **Bot-question honesty.** A sincere "are you a bot?" goes to a person without calling the model. Deflection can never cover identity, and an identity-claim validator backs it.
- **Visible "why this draft" panel.** Shows stage, offer allowed, examples used, guards fired and tokens. It is also the debugging tool for the weak model.
- **Price held by code, not by prompt.** Off-menu prices are never shown as a normal draft.
- **Grounded facts.** A closed "facts you may use" list and an "unknown to you" list, plus a post-check.
- **Per-fan no-repeat memory** and n-gram checks against her last 30 sends.
- **Typed escalation reasons** with a sticky safety floor and a ranked queue.
- **Fan-protection rules** in the offer gate (no selling after "stop", affordability or distress signals; follow-up cap).
- **A parity-tested engine,** so the simulator and the worker cannot silently drift.
- **Her real replies as examples,** only creator-verified, only with consent, redacted, only inside her own prompt.
- **A measurable regression suite** that runs before and after every prompt or model change.

---

## 10. Hard rules and how each milestone respects them

| Rule (CLAUDE.md) | How the plan respects it |
|---|---|
| AI off by default, default send mode draft | M2 refuses `send_mode: auto` and moves existing auto accounts to draft with a notice. Capability tier defaults to draft only |
| Jazz writes drafts, a person approves each one. Auto-send is NOT decided | Every new behaviour (M3, M6, M9, M12) produces an outbox row with status `draft`. A draft is never queued without a person's Approve, and a unit test asserts approve is the only `draft` to `queued` path. `not_before` is only a reminder time and the send worker ignores `draft` rows. M9 does not import the send path. Cadence is simulator behaviour and draft metadata. The sim is labelled "Simulation. Real sending to fans is off" and sim-only behaviours are marked "Simulated" |
| No invented facts | Closed facts list, `validateDraft`, hold-with-reason (M4). Memory has sources, a denylist, consent, retention and a delete control (M7). Auto-extraction waits for Claude |
| Sincere bot question to human | Stays a code rule ahead of the model in `preModelVerdict`. Deflection excludes identity. `validateDraft` rejects identity claims. No humanising feature adds a path that claims to be human |
| Tip, PPV purchase, big spender, person replying, needs_human go to human mode | Kept and made stricter (typed categories, sticky safety floor). New categories add to, never remove, a trigger |
| Auto mode still holds off-menu prices and replies over 1000 chars | `priceNotOnMenu` and `MAX_MESSAGE_CHARS` stay. Validators add to them |
| Every account route uses `requireAccount` | New endpoints (feedback, memory CRUD, notes, forget fan) follow the handler pattern with ownership checks |
| Nonce CSP, no inline styles or scripts | New panels (why panel, Insights, scenario picker) use classes only |
| Secrets never leave `accounts` | No new secret handling. New code gets a ready client |
| Sends use outbox id as Idempotency-Key; `unknown` outcomes never resent | Untouched. M11 adds a reconcile step and only after consent |
| Architecture rules | New logic goes in `service.ts` with a `// ---- topic` banner. Pure rules in `schema.ts` with no zod. `inbox` never imports creator or assistant (`buildFanContext` is in `creator/service.ts`). `assistant` calls `creator` directly for feedback. No reversed bus arrows |
| Migrations only by new file, applied at start | Phase B is split into 014 to 020 |
| One account's chats used only inside that account's prompt, never pooled or used to train a shared model | Every new table is keyed by `account_id` with a delete handler in its owning feature, plus a test that every `account_id` table is covered. Retrieval is per account and redacted. A CI test checks every new query's account scoping |
| No real send without the user's consent and a test fan | Only M11, and only after an ADR and a test fan |

---

## 11. Risks

- **The local 3B model** cannot follow an extended schema, validators or a layered prompt reliably, and cannot judge. Mitigation: code does the logic, prompts stay short, the state block stays under about 600 characters, keep the degraded Ollama path, sign off voice only on Claude, and test code rules with the stub writer.
- **Prompt budget on Ollama.** More blocks push facts, Train and scripts past the 3200-character slice. Mitigation: priority-aware truncation, and the state block is never cut.
- **Simulator drift.** Mitigation: shared pure functions, the parity test, the existing `autopilot.test.ts` as oracle, and a `check:boundaries`-style rule that fails if `autopilot.ts` defines a verdict function of its own.
- **Author contamination.** OFMAPI exposes only `isFromMe`, so chatters and past Jazz drafts could be learned as "her" voice. Mitigation: extend `messages.source`, `creator_verified` off by default, per-range previewed confirmation with sampled review, a "not me" mark, and owner-only approvals feeding the pool.
- **Fan text leaking between fans** through examples. Mitigation: `redact()` before storage and before reuse, with tests.
- **Wrong or sensitive memory** breaks the illusion and the no-invented-facts rule. Mitigation: consent off by default, source ids, a code denylist, confirmation before use, retention within the message purge, and a per-fan forget action.
- **Humanising slides into deception.** Typing and delay effects imitate a person. Mitigation: metadata only, boundary rule against the send path, "Simulated" labels, bot-question and identity rules in code, never auto-send, and disclosure wording first.
- **Selling pressure on vulnerable fans.** Mitigation: no-sell signals, a follow-up cap and a sticky stop after "stop".
- **Explicit content.** Mitigation: a creator-level ceiling, a code-enforced floor that no chip can relax, validators after every steered redraft, provider policy limits as an owned open item, and no explicit text in logs, eval reports or CI.
- **Retrieval recitation or over-stuffing.** Caps, relevance thresholds and the copy-overlap check.
- **Stage thresholds are guesses** and English-only keyword lists miss other languages. Mitigation: configurable conservative defaults in Advanced, the model's `fan_signal` as a second input, multilingual cases in M2, tuning on the replay set.
- **Latency and cost** from retries and extra calls. Mitigation: bubble splitting is code-only, one retry maximum, memory and summary jobs run in the background on Claude only, prompt-cache the static prefix, a per-draft cost budget.
- **Provider unknowns.** Send shape, Idempotency-Key, online/subscription/like webhooks, unsend endpoint. Anything depending on them stays simulator-only and is labelled "Simulated". The provider also stores the creator session unencrypted at rest.
- **Privacy and legal.** Fan facts are sensitive. Third-party AI receives chat text. Release gate before M5a, M7 and M8: written answers on Anthropic API retention and training settings, a data-flow table in `docs/adr/` (field, provider, retention), a data-processing note for the creator, and an OnlyFans terms review. SuperCreator's own terms are unreconciled and not our reference.
- **Edit capture can be gamed or misread.** Edit distance, audits, owner-only pool, and rejected drafts never trained on.
- **Judge bias and noise.** Pairwise with swapped positions, calibrated on human labels, advisory only.
- **Over-fitting to Izzy** from partly unrecorded screens. Treat parity as target behaviour, not an exact UI.
- **Migration safety.** Many tables; split files and the server must start from the project root.

---

## 12. What we need from the client or user

1. **A Claude key** (`ANTHROPIC_API_KEY`) or an explicit decision to stay on Ollama. Needed for M7 extraction and M8, and for any voice sign-off. Target default `claude-sonnet-5-5`.
2. **Consent decisions in writing:** may Jazz learn from this creator's synced chats; may it store fan memory (and which categories are forbidden); may it draft bumps and follow-ups on a schedule (drafts only); may fan name and username go to the model (default: pseudonym).
3. **Who wrote the history:** are the synced creator-side texts all hers, or do chatters or agency staff appear; the chatter names or a "not me" mark; whether old mass messages and bumps stay excluded (our default); known chatter hours if any.
4. **A clean product catalog:** at least 5 products with human names (not "Product 36"), prices, one-line descriptions, progression and media counts; and 2 bump messages with price and media.
5. **Her answers for the unused Bio fields** (`collect_info`, `language_notes`, `ai_pricing`, strategy including whether Rapport mode ever sells, `unavailable_social`, `assign_fan_lists`), collected through the existing Request from Creator link. Plus 5 to 10 deflection lines in her voice for requests she refuses (off-platform contact, meeting, custom orders). Identity questions are never part of this list.
6. **Stage and sales thresholds:** turns before the first offer, minimum gap between offers, maximum offers per fan per day, follow-up cap, what counts as a big spender and a Super Fan, her real active hours, and her explicitness ceiling.
7. **Languages she writes in**, so the escalation keyword sets cover them.
8. **Auto-send decision:** confirmation that it stays out of scope, a test fan the user owns, and explicit consent before any real send (M11).
9. **Approval to register more webhooks** (users.online, subscriptions, post likes, with the retention described in section 6) and to read `/transactions` (read-only) on the test account.
10. **Answers to open provider questions:** unsend or delete endpoint, follow endpoint, typing endpoint, whether Idempotency-Key is honoured.
11. **Reviewers and samples:** at least one person to read and thumb drafts for a week, 20 to 30 examples of what "bad" looks like (assistant tone, too eager to sell, repeated lines), and a reviewer for the 10 blind transcripts.
12. **A legal read** of OnlyFans terms on AI-assisted chat and of data use with the AI provider, the AI provider's retention and training settings, and the **disclosure wording** the client wants. The wording must exist before any production use of cadence or humanising features.

---

## 13. Unknowns we cannot know without Izzy's untrained-account recording

These are not guessed in the plan. Where we built a stand-in, it is marked inference.

- Whether "Your Response" in an untrained Train scenario is empty, prefilled with an Izzy draft, or filled from old chats. The recorded account was already 57/57.
- What the Edit Response modal offers, whether there is a Save toast, and what an unanswered scenario looks like.
- What "Import responses from other creator" copies (answers, scenarios, which creators), and whether answers can be deleted or reset.
- Whether Train has an AI-suggest control.
- The real mechanism (few-shot prompt, retrieval, fine-tuning), how many answers are used per reply, and whether answers are used word for word or as inspiration. Our stand-in is per-account few-shot retrieval (inference).
- Whether Train is required before turning Izzy on (only inferred as encouraged, not a gate).
- Whether the "Make it more" chips and the Short/Medium/Long and Implicit/Neutral/Explicit toggles rewrite the current draft or only steer the next one, and whether they persist per chat. Our M6 rewrites through the same validators (inference), with explicitness as a creator-level ceiling.
- Where "Helpful?" thumbs and upvote/downvote data go, what a downvote changes, and whether a vote carries a reason. How Izzy "learns from conversions" has no stated method; M6 only logs outcomes and does not claim conversion learning.
- How chat-history learning works (upload at onboarding or continuous, creator-only or fans too) and how Izzy separates the creator from chatters given "Sent by" names.
- Whether Preferences tags are AI-found vs manual, and whether Izzy reads Insights, Notes and Preferences when writing.
- What Izzy Monitor, Analytics > Izzy and the Activity Log contain, and the first-week chat cap.
- How a free-text script trigger is matched (model judgement vs rules), priority, and no-match behaviour; whether Izzy may price off-menu or must use the bundle minimum. Ours matches triggers in code and holds off-menu prices.
- Numeric escalation thresholds, the Super Fan definition, the escalation alert channel, and how Renew Off and Expired are detected.
- Whether SuperCreator pools creators' chats for training, and whether its AI providers train on the data. We treat this as a constraint on ourselves (no pooling), not as a model to copy.
- Enforcement location (code vs prompt) of once-per-fan, recency guard and exclusions in Izzy. Ours is code.
- What a fan reply does to a running flow in the real product (our default: the flow pauses), the flow Goal editor, and Super Mass steps 2 to 4.
- Every item in `docs/research/supercreator-creator-gaps.md` marked "never opened". That document dates from 2026-11-20 and parts are stale (Request from Creator, Import and Advanced Settings now exist in code).

**Recommended next recording:** a fresh trial account, from the first click in Train, to settle the first six items above. The Izzy Monitor and vote screens are the next most valuable.

---

## Review notes

**What changed from the draft, by critique.**

Feasibility:
- `buildFanContext` moved from `inbox` to `creator/service.ts`. Plain DB reads stay in `inbox/queries.ts`. This fixes the layering violation.
- Dropped the `messages.author` column. We extend the existing `messages.source` vocabulary and add a nullable `creator_verified` instead. The filters in `herTypicalWords`, `recentPpvs` and `widelySent` are updated in the same step.
- Dropped the `draft:approved`/`draft:rejected` bus events. `assistant` calls `creator/service.ts` directly.
- M0 now says rules are re-parameterised to plain arguments before moving. Thin `Sim` wrappers stay, the existing `autopilot.test.ts` is the oracle, and `flooding` is deduplicated. "PriceGuard" is corrected to a comment inside `personalPrice`.
- `repeatsEarlier`, `soundsLikeSupport`, `decideReply`'s retry, `priceNotOnMenu`, `asksForFacts` and `closestAnswer` are shown as existing and generalised in M4. `creatorPairs` is marked new. `mostRelevant` is kept as the base of `rankExamples`.
- `feedback` kind added to `Kind`, `ItemKind`, `ITEM_DATA` and `ItemData`, and excluded from list UIs and import. `startsAt` filter added in M0.
- `outbox.original_text` is written in the approval UPDATE. `draft_group`, `not_before` and the `usage` link are deferred. The "never queued" wording is fixed.
- Migrations are listed as 014 to 020 with owners. Per-feature deletion handlers on `connection:removed` replace the cross-feature `deleteAccountFans` idea. Memory retention is no longer longer than the purge.
- M5 is split into M5a, M5b and M5c. M0 is resized to M-L and M3 to L.
- `assign_fan_lists` is scheduled in M3, and the `ai_pricing` vs `personalPrice` conflict is defined.

Safety:
- Cadence is metadata only, with a boundary rule, "Simulated" labels and disclosure wording first.
- Deflection excludes identity topics. An identity-claim validator and a model-side second net are added.
- Memory defaults to off, with a denylist, retention, confirmation before use and per-fan forget.
- The safety floor is now sticky and blocks all automations. The category is stored in `handoff_reason` in phase A.
- The send path is separated from drafts. Existing `auto` accounts are handled. Approve is the only `draft` to `queued` path. The sim has a banner.
- Added redaction, owner-only pool feeding, replay consent gating, a provider data-flow release gate, data minimisation, an explicitness ceiling and fan-protection rules in the offer gate.

Completeness:
- Added M12 (Expired Fans and Super Mass as drafts), an arbitration order, Flows in M9 and the Message Library in the wiring map.
- Moved the worker "what is due now" function into M0 and added a dry-run button, so M9 is testable. Defined the sandbox fan, fixed the phase A/B boundary, added a baseline step and the stub writer for deterministic tests, and added live-update expiry, vault media staleness and a cost budget. A source pointer was added to the parity table intro.

**Nice-to-haves left out, and why.**
- Per-row source columns in the parity table. Instead, one source file is named plus a note on stale rows. A full column would be a refresh task for M0 step 0.
- A full per-fan "forget" UI design. It is listed as a deliverable of M7 but not specified.
- Moving the plan to `docs/adr/`. It stays in `docs/plan/` (noted as a new directory), and the consent and data-flow decisions are ADRs.
- A fully separate "batch endpoint" design. M1 and M10 only require a higher owner-only limit.
- Flow statistics, goal attribution and Merge-node joins stay deferred as a stated scope cut, because only partial recordings exist.

---

## Added after the review: recording of 2026-11-25 (Serena's inbox)
Source: `docs/research/supercreator-inbox-izzy.md`, section "Added 2026-11-25". This recording arrived while the plan was being written, so it is added here and mapped to milestones.

| Seen in the recording | What it changes | Milestone |
|---|---|---|
| "Use AI to fill their info" card with a **Fill with AI** button | Fan memory is filled **on demand by a person**, not silently. Our M7 extraction starts from a button in the Insights panel, with the result shown for review before it is saved. | M7 |
| Notes as short **labelled fan facts** (Occupation, Hobbies, Current Residence, Pets, Budget habits, dates, do/don't) | Use these labels as the `fan_memory` categories (plus a denylist), so the state block can say "Occupation: works mornings". | M7 |
| Info block: Fan since, Last subscription, Total spend, Workspace spend, Last paid, Came from, Campaigns, Location, Language | Most come from data we have (`subscribed_at`, `total_spend`, `last_paid_at`); Came from / Campaigns / Location / Language need provider data or are unknown. Show what we have, label the rest "not known". | M7 |
| Every message labelled: "Sent by <chatter>", **Bump**, **Mass Message**, "Unsent by Fan/Unknown", PPV "$X not paid yet" / paid | The writer's history needs the same markers (the simulator already adds bump/offer notes via `marks()`); the real inbox needs them from `messages.source`, `widelySent` and the media price fields. This is also how "learn from her chats" avoids chatter and mass text. | M0, M3, M5a |
| Chat list: lifetime spend, Renew Off, Expired, super-fan mark, nickname; Filters incl. **Hide chats handled by Izzy AI**, spend range, subscribed within | Inbox filters and badges for the human team, split from Jazz's chats. Not a writer change; add to M6 (draft review) scope as inbox UI. | M6 |
| Flows tab with per-fan "Flow history" | Per-fan flow runs are worth storing when flows run for real. | M9 |

