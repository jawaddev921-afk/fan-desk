// The creator Bio: the form is defined here once (the browser renders it, the server uses the same list to keep only known answers).
import { AI_NAME } from "../../config/ai.ts";
import { flagOf, ZONES } from "../../config/timezones.ts";

type Kind = "text" | "area" | "select" | "multiselect" | "radio" | "tags" | "checks" | "date" | "measure" | "emoji" | "switch" | "slider" | "yesno";
export type Field = {
  key: string;
  label: string;
  kind: Kind;
  /** select / checks / slider: the choices. measure: the units. */
  options?: readonly string[];
  /** select: a line under each choice in the list; beta: choices marked Beta. */
  details?: Readonly<Record<string, string>>;
  beta?: readonly string[];
  /** A small icon and a right-hand note per choice in the list (a flag and the UTC offset for countries). */
  extra?: Readonly<Record<string, { icon?: string; meta?: string }>>;
  hint?: string;
  placeholder?: string;
  /** The text of the (i) icon next to the label. */
  info?: string;
  /** A select with four or fewer choices is a row of buttons; this keeps it a dropdown. */
  dropdown?: boolean;
  max?: number;
  /** Layout: a heading before the field, a rule before it, or the number of columns this field shares a row with. */
  heading?: string;
  rule?: boolean;
  cols?: number;
  required?: boolean;
};
export type Section = { id: string; title: string; tip?: { title: string; text: string }; fields: readonly Field[] };
export type BioValue = string | string[];
export type BioValues = Record<string, BioValue>;

type Opts = Partial<Field>;
// Emoji that the creator form shows at the end of some questions.
const EMOJI: Record<string, string> = { birth_date: "\u{1F382}", relationship: "\u{1F49E}", orientation: "\u{1F308}", work: "\u{1F4BC}", pets: "\u{1F436}\u{1F42F}\u{1F422}", religion: "\u{1F64F}", ideology: "\u{1F4AD}", hair: "\u{1F487}", eyes: "\u{1F441}\u{FE0F}", ethnicity: "\u{1F30D}", dreams: "\u{1F31F}", hobbies: "\u{1F3A8}", morning: "\u{2600}\u{FE0F}", night: "\u{1F319}", fav_food: "\u{1F355}", fav_drink: "\u{1F379}", fav_color: "\u{1F308}", fav_music: "\u{1F3B5}", fav_books: "\u{1F4DA}", fav_movies: "\u{1F3AC}", funny_story: "\u{1F602}", facts: "\u{1F92F}", attracted_to: "\u{1F970}", like_in_them: "\u{1F497}", turns_on: "\u{1F525}", fetishes: "\u{1F608}", naughty: "\u{1F609}", fan_nicknames: "\u{1F496}", avoid_topics: "\u{1F6AB}", avoid_words: "\u{1F6AB}", fan_feel: "\u{2728}", strategy: "\u{1F3AF}", niche: "\u{1F3AF}", red_lines: "\u{26D4}", handles: "\u{1F517}", multilingual: "\u{1F238}" };
const f = (kind: Kind, key: string, label: string, o: Opts = {}): Field => ({ key, label: EMOJI[key] ? `${label} ${EMOJI[key]}` : label, kind, ...o });
const t = (key: string, label: string, o?: Opts) => f("text", key, label, o);
const a = (key: string, label: string, o?: Opts) => f("area", key, label, o);
const tags = (key: string, label: string, o?: Opts) => f("tags", key, label, o);
const pick = (key: string, label: string, options: readonly string[], o?: Opts & Partial<Field>) => f("select", key, label, { options, ...o });
const slider = (key: string, label: string, options: readonly string[]) => f("slider", key, label, { options });

const LANGUAGES = ["English (US)", "English (UK)", "English (Canada)", "English (Australia)", "Spanish", "French", "German", "Italian", "Portuguese", "Dutch", "Polish", "Romanian", "Russian", "Ukrainian", "Turkish", "Arabic", "Hindi", "Urdu", "Filipino", "Japanese", "Korean", "Chinese (Mandarin)", "Swedish", "Norwegian", "Danish", "Greek", "Czech"] as const;
const SERVICES = ["GFE (sexting for tips)", "Dick rating", "Selling custom content (aka customs)", "Selling a VIP package", "Selling content through wall posts or feed campaigns", "Selling physical goods like used underwear, etc"] as const;
const FAN_INFO = ["Fan name", "Turn-ons", "Hobbies and interests", "Current residence", "Occupation"] as const;
const COUNTRIES = ZONES.map(([, label]) => label);
const COUNTRY_EXTRA = Object.fromEntries(ZONES.map(([code, label, utc]) => [label, { icon: flagOf(code), meta: utc }]));
const PERSONAS = {
  "Girl Next Door": "Familiar, caring, and approachable, builds deep connections with fans.",
  "Popular Girl": "Confident, charismatic, and effortlessly commands attention.",
  "PG Influencer": "Social media star who avoids explicit content but loves to tease and flirt.",
  Diva: "Glamorous and confident, knows her worth and takes control.",
  "Naive Girl": "Seems naive at first glance, but she is anything but innocent.",
  MILF: "Confident, experienced, and seductive. Knows exactly how to make fans feel desired and taken care of.",
  "Goth Girl": "Dark, mysterious, and emotionally intense: the perfect mix of danger and allure.",
  "Fitness Babe": "Motivational, disciplined, and sexy. Inspires fans with energy and confidence.",
  "CEO Babe": "Ambitious, powerful, and in charge. Commands respect and desire effortlessly.",
  Dom: "Commanding, confident, and fully in control. Leads every interaction with authority while keeping the fan craving more.",
} as const;
const STRATEGIES = {
  Normal: `Best for most creators. ${AI_NAME} keeps a natural, optimal flow, balancing warm-up, connection and proactive selling.`,
  Aggressive: `${AI_NAME} leads the chat toward sales and warm-up more often. Ideal for creators with high fan turnover or strong conversion rates.`,
  Conservative: `${AI_NAME} spends more time building rapport before selling. Best for creators who prefer deeper connections and fewer sales pushes.`,
  Savage: `${AI_NAME} goes all-in on selling, no time for small talk. Warning: may feel spammy or bot-like to some fans.`,
  "Rapport mode (no sales)": `${AI_NAME} focuses entirely on building connection without promoting sales. If a fan asks for content, relevant products are offered only if they are in the Product catalog; otherwise the chat is handed to a human.`,
  "Convert fans from free page to VIP page": `${AI_NAME} moves fans from the free page to the VIP page.`,
} as const;
const PRICING = { "Default AI mark-up (Highly recommended)": `${AI_NAME} adds a small mark-up to prices of products marked for AI pricing.`, "Exact prices (no mark-up)": `${AI_NAME} always quotes your prices exactly as saved.` } as const;

export const BIO_SECTIONS: readonly Section[] = [
  {
    id: "personal",
    title: "Personal info",
    tip: { title: "Be descriptive", text: "The more details you share, the better. E.g. instead of: \"I work as a designer\", write: \"I've been a designer for years. I've loved art since I was a kid, and now get to live my dream!\"" },
    fields: [
      t("name", "Name", { required: true }),
      tags("nicknames", "Nickname(s)", { placeholder: "What nicknames do you go by, or prefer?" }),
      pick("gender", "Gender", ["Female", "Male", "Non-binary", "Other"], { required: true, dropdown: true }),
      f("date", "birth_date", "Birth date", { required: true }),
      pick("relationship", "Relationship status", ["Single", "In a relationship", "Married", "It's complicated", "Open relationship"], { required: true }),
      pick("orientation", "Sexual orientation", ["Straight", "Bisexual", "Gay / Lesbian", "Pansexual", "Other"], { required: true }),
      pick("country", "Country & time zone", COUNTRIES, { required: true, extra: COUNTRY_EXTRA, heading: "Where do you live? \u{1F3E1}", cols: 3 }),
      t("city", "City/Area", { required: true, cols: 3 }),
      f("radio", "traveling", "Are you traveling right now?", { options: ["No", "Yes"], cols: 3, info: "Say yes if you are away from home, so replies do not mention where you normally live." }),
      t("grew_up", "Where did you grow up?", { required: true }),
      t("work", "What do you do for work currently?", { rule: true }),
      t("prev_jobs", "What were your previous jobs or careers?"),
      f("multiselect", "languages", "What languages do you speak?", { options: LANGUAGES }),
      t("language_notes", "Language level / dialect or other notes", { placeholder: "\"California Valley Girl\", \"learning a little spanish\", \"baltimore slang\"" }),
      t("education", "What is your educational background?"),
      t("children", "Do you have any children? How many?"),
      t("pets", "Do you have any pets?", { max: 150 }),
      t("siblings", "Do you have any siblings? How many?"),
      t("religion", "What are your religious beliefs?"),
      t("ideology", "What are your ideological beliefs?"),
      a("online_persona", "Describe your online persona. How do you sound to fans?", { rule: true }),
      a("other_info", "Any other information you'd like to share?"),
    ],
  },
  {
    id: "chatting",
    title: "Chatting",
    fields: [
      pick("persona", "What is your persona type?", Object.keys(PERSONAS), { required: true, details: PERSONAS, hint: "Personas are pre-trained chat styles. Pick the one that fits you best, then fine-tune it with the settings below." }),
      pick("strategy", "Chatting strategy", Object.keys(STRATEGIES), { required: true, details: STRATEGIES, beta: ["Savage", "Rapport mode (no sales)", "Convert fans from free page to VIP page"], hint: `Choose how ${AI_NAME} leads chats with fans. Each mode adjusts her main goal, tone, pacing, and balance between building rapport and driving sales.` }),
      f("switch", "assign_fan_lists", "Assign fan lists", { hint: "Give some fans a different chatting strategy, based on the lists they are on. Fans on no list get the strategy above. (Fan lists are not available yet; this is saved for later.)" }),
      pick("multilingual", "Multilingual mode", [`Off: ${AI_NAME} will only reply in the languages you speak`, `On: ${AI_NAME} will reply in the fan's native language, and mention using the translate tool`], { hint: "Respond to fans in their native language, even if it is not one you speak." }),
      slider("writing_level", "Writing level", ["Relaxed", "Mixed", "Proper"]),
      slider("explicitness", "Explicitness level", ["Keep It Clean", "Natural", "Extra Dirty"]),
      slider("punctuation", "Punctuation style", ["Minimal", "Casual", "Proper"]),
      slider("capitalization", "Capitalization style", ["Lowercase", "Proper Names", "Proper"]),
      t("laughter", "How do you express laughter in text?", { hint: "e.g. lol, haha" }),
      t("slang", "Which slang do you use?", { required: true }),
      f("emoji", "emojis", "What are your favorite emojis?", { required: true }),
      tags("fan_nicknames", "What nicknames do you use for your fans?", { required: true }),
      f("checks", "collect_info", `What info should ${AI_NAME} collect about your fans?`, { options: FAN_INFO }),
      a("avoid_topics", "Are there any topics that should be avoided or handled with care?", { hint: `${AI_NAME} never talks about anything that is not allowed, so only include topics personal to you.` }),
      tags("avoid_words", `Are there any words or phrases you want ${AI_NAME} to avoid using?`, { hint: "Words forbidden by OnlyFans are blocked by default, so only include words or phrases personal to you." }),
      a("love_topics", "What topics do you love talking about and why? What subjects do you know a lot about?", { required: true }),
      t("fan_feel", "How do you want your fans to feel when chatting with you?"),
      a("not_creator_reply", "What would you say to a fan who says they are not talking to the creator? Provide some example responses.", { hint: "Leave empty in order to escalate these scenarios to a human." }),
    ],
  },
  {
    id: "lifestyle",
    title: "Lifestyle",
    tip: { title: "Write for fans", text: "Write your replies as if you are actually talking to your fans: naturally, engagingly, and in your own voice. Do not overthink it, just be yourself." },
    fields: [
      a("dreams", "What are your dreams or goals?", { required: true }),
      a("hobbies", "What are your hobbies and interests? What do you enjoy about them?", { required: true }),
      a("workout", "Do you work out? What sports or workout routines do you enjoy?"),
      a("typical_day", "What does a typical day in your life look like? What do you usually do?", { required: true }),
      t("morning", "What's your morning routine like?"),
      t("night", "What's your night routine like?"),
      t("weekends", "What do you do on the weekends?"),
      t("fav_food", "Favorite foods"),
      t("fav_drink", "Favorite drinks"),
      t("fav_color", "Favorite color"),
      t("fav_music", "Favorite music"),
      t("fav_books", "Favorite books"),
      t("fav_movies", "Favorite movies"),
      t("drinking", "Drinking habits"),
      t("smoking", "Smoking habits"),
      a("funny_story", "Share a funny story about yourself"),
      a("facts", "Share some unexpected facts about yourself"),
      a("sports", "Do you enjoy watching sports? What sports do you like to watch?"),
    ],
  },
  {
    id: "physique",
    title: "Physique",
    fields: [
      t("body_type", "How would you describe your body type?"),
      t("ethnicity", "What is your ethnic background?"),
      t("hair", "Hair color"),
      t("eyes", "Eye color"),
      f("measure", "height", "Height", { options: ["ft", "cm"] }),
      f("measure", "weight", "Weight", { options: ["lb", "kg"], hint: "Leave empty if irrelevant" }),
      t("cup_size", "Cup size"),
      t("dick_size", "Dick size"),
      f("yesno", "tattoos", "Do you have tattoos?", { hint: "Say where they are and what they are." }),
      f("yesno", "piercings", "Do you have piercings?"),
    ],
  },
  {
    id: "content",
    title: "Content",
    fields: [
      a("niche", "Describe your niche and what content your fans are looking for in 2-3 sentences", { required: true }),
      f("checks", "services", "Custom services", { options: SERVICES, hint: `Select which services you offer fans (like custom videos or ratings). If a fan asks for something you turned on, ${AI_NAME} will pass it to you or your team. If it is not selected, it politely says it is not available and keeps the chat going naturally.` }),
      tags("other_services", "Custom items", { hint: "Add any other service you offer" }),
      pick("ai_pricing", "AI pricing strategy", Object.keys(PRICING), { required: true, details: PRICING }),
      tags("content_offered", "What content do you offer on your page?"),
      tags("red_lines", "What content or services is a red line for you?", { hint: `${AI_NAME} never talks about anything that is not allowed, so only include topics personal to you.` }),
    ],
  },
  {
    id: "intimate",
    title: "Intimate details",
    fields: [
      a("why_started", "Why did you start your OnlyFans?", { required: true }),
      a("attracted_to", "What type of people are you attracted to?"),
      a("like_in_them", "What do you like in the people you're attracted to?"),
      a("turns_on", "What turns you on?"),
      a("fetishes", "What are your fetishes?", { hint: "Share your fetishes and kinks" }),
      a("naughty", "What naughty experiences have you had?"),
      a("open_relationships", "What are your thoughts on open relationships?"),
    ],
  },
  {
    id: "socials",
    title: "Socials",
    fields: [
      tags("other_platforms", "Which other explicit (NSFW) platforms are you active on?"),
      tags("social_platforms", "Which social media platforms are you active on?"),
      t("handles", "Social media handles"),
      a("unavailable_social", "How should you handle requests about unavailable social media content?", { hint: "What should you do if a fan asks about your recent updates on social media, but the information isn't available in the bio? Additionally, provide an example of how you would respond." }),
    ],
  },
] as const;

const FIELDS = BIO_SECTIONS.flatMap((s) => s.fields);
const KNOWN = new Map(FIELDS.map((x) => [x.key, x]));
const REQUIRED = FIELDS.filter((x) => x.required);

const filled = (v: BioValue | undefined) => (Array.isArray(v) ? v.length > 0 : !!v?.trim());
const LIST_KINDS: readonly Kind[] = ["tags", "checks", "multiselect"];

/** An answer saved under an older wording ("Aggressive: leads toward sales", "Proper names") still finds its option. */
function matchOption(text: string, options: readonly string[] | undefined): string | undefined {
  const low = text.trim().toLowerCase();
  const head = low.split(":")[0]!.trim();
  return options?.find((o) => o.toLowerCase() === low) ?? options?.find((o) => o.toLowerCase().split(":")[0]!.trim() === head) ?? options?.find((o) => o.toLowerCase().startsWith(head) || head.startsWith(o.toLowerCase()));
}

/** Keeps only answers to known questions, in the right shape (a pick must be a listed option, a date a date). Empty answers are dropped. */
/** The emojis she wrote in the Bio (what are your favorite emojis?), one by one. */
export function bioEmojis(bio: BioValues): string[] {
  const raw = Array.isArray(bio.emojis) ? bio.emojis.join("") : String(bio.emojis ?? "");
  const out: string[] = [];
  for (const m of raw.matchAll(/\p{Extended_Pictographic}\uFE0F?/gu)) if (!out.includes(m[0])) out.push(m[0]);
  return out.slice(0, 12);
}

export function cleanBio(values: BioValues): BioValues {
  const out: BioValues = {};
  for (const [key, v] of Object.entries(values)) {
    const x = KNOWN.get(key);
    if (!x || !filled(v)) continue;
    if (LIST_KINDS.includes(x.kind) !== Array.isArray(v)) continue;
    if (Array.isArray(v)) {
      const items = v.map((e) => e.trim()).filter(Boolean);
      out[key] = x.kind === "checks" || x.kind === "multiselect" ? [...new Set(items.map((e) => matchOption(e, x.options)).filter((e): e is string => !!e))] : items;
    } else {
      const text = v.trim();
      if (x.kind === "select" || x.kind === "slider" || x.kind === "radio") {
        const hit = matchOption(text, x.options);
        if (hit) out[key] = hit;
        continue;
      }
      if (x.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) continue;
      if (x.kind === "switch" && text !== "on") continue;
      if (x.kind === "measure" && !/^[\d.'"/ -]{1,12}( ?[a-z]{2})?$/i.test(text)) continue;
      if (x.kind === "yesno" && !/^(No|Yes)(: [\s\S]{1,300})?$/.test(text)) continue;
      out[key] = text;
    }
  }
  return out;
}

/** Share of the required questions answered, 0-100. */
export const bioPercent = (values: BioValues) => Math.round((100 * REQUIRED.filter((x) => filled(values[x.key])).length) / REQUIRED.length);

// ---- items (products, bump messages, scripts, live updates)
export const BUMP_TRIGGERS = ["Online", "Tipped", "Engaged with a post"] as const;
export const SCRIPT_TRIGGERS = ["New subscriber", "First message from a fan", "Fan tips", "Fan buys", "Keyword in a message"] as const;
export const MAX_LIVE_UPDATES = 7;
// Ready-made bump messages to start from (written for this app; edit them to sound like the creator).
export const BUMP_TEMPLATES = ["hey you.. how are you?", "what are you up to right now?", "{name}, I was just thinking about you", "are you still up? keep me company", "guess what I'm doing right now", "missed you today, where have you been?", "{name} I have something to show you", "don't keep me waiting...", "how's your day going?", "want a little sneak peek?"] as const;

// ---- train: sample chats the creator answers in her own words. The writer learns her voice from these answers.
// The built-in samples are neutral. Anything more specific is added by the creator or her team as a custom sample (Train > Add sample).
export type Turn = { from: "fan" | "creator"; text: string };
type Sample = { key: string; title: string; turns: Turn[] };
export type TrainCategory = { id: string; title: string; samples: Sample[] };
const fan = (text: string): Turn => ({ from: "fan", text });
const her = (text: string): Turn => ({ from: "creator", text });
const sample = (key: string, title: string, ...turns: Turn[]): Sample => ({ key, title: title.replace(/\b[a-z]/g, (c) => c.toUpperCase()), turns }); // Title Case, as in the list we copy
export const TRAIN: readonly TrainCategory[] = [
  {
    id: "rapport",
    title: "Rapport",
    samples: [
      sample("unavailable-social", "Unavailable social content", fan("Did you see my message about your Instagram story? What did you post?"), her("I haven't posted anything new there lately"), her("I've been saving the good stuff for here")),
      sample("day-off", "Day off", her("How's your week going?"), fan("Finally a day off. No alarms, no plans.")),
      sample("sushi", "Sushi conversation", her("What's your favorite food?"), fan("I had the best sushi of my life tonight."), fan("Do you like sushi?")),
      sample("checking-in", "Just checking in", fan("Hey, just wanted to see how your day is going.")),
      sample("busy-work", "Busy work day", fan("Hey (FAN NAME), how was your day?"), her("Hi, I'm doing good, wbu?"), fan("Work has been crazy today."), fan("Back to back calls, I'm tired.")),
      sample("lazy-tv", "Lazy TV watching", her("What do you do when you're feeling lazy?"), fan("Doing nothing but binge watching a show tonight.")),
      sample("compliment", "Flirty compliment", fan("I love comedy shows."), fan("You and comedy are my two favorite things.")),
      sample("goodnight", "Goodnight wishes", fan("I can't sleep at my job tonight."), her("Aww that sounds rough"), fan("Thanks for the fun chat. I'm heading to bed. Goodnight, sleep well.")),
      sample("tired", "Tired fan", fan("Long day. I'm completely exhausted."), fan("It was a very, very long one.")),
      sample("still-awake", "Still awake", fan("I know it's late, but I'm not sleepy at all."), fan("How was your day?")),
      sample("seattle", "Seattle memories", fan("I lived in Seattle for years."), her("Oh wow, did you like it?"), fan("Loved it, met some really nice people there.")),
      sample("birthday", "Birthday", fan("It's my birthday today!")),
      sample("busy-fan", "Busy fan", fan("Sorry I've been quiet, all I did was work and sleep.")),
      sample("proud-fan", "Proud fan", fan("Guess what, I'm getting an award from my town."), fan("It's for helping someone in need. How have you been?")),
      sample("workout", "Workout mood", fan("You seem so full of energy today, why?"), her("I just finished a workout"), fan("Lucky workout partner. What did you train?")),
      sample("long-absence", "Long absence", fan("Sorry I disappeared for a while, life got busy."), her("It's been too long"), her("I missed our chats"), fan("Work took me out of town, no network at all.")),
      sample("casual-activities", "Casual activities", fan("What have you been up to?"), her("Just relaxing today"), fan("Do your fans keep you busy with messages?")),
      sample("netflix", "Netflix discussion", fan("What do you do in your free time?"), her("Mostly relax and watch shows"), fan("Must be nice."), fan("Anything good on Netflix right now?")),
      sample("wellbeing", "Simple wellbeing check", fan("I'm doing well. How are you?")),
      sample("lovely-compliments", "Lovely compliments", fan("I really like you."), fan("The camera loves you.")),
      sample("personal-info", "Personal info", fan("Tell me something about yourself that I don't know yet.")),
      sample("sad-day", "Sad day", her("What's wrong?"), fan("Nothing, just a bad day."), her("Want to talk about it?"), fan("?")),
      sample("morning-thoughts", "Morning thoughts", fan("Good morning, beautiful."), her("Good morning you"), her("Did you sleep well?"), her("I thought of you today"), fan("Did I really pop into your head?"), fan("That makes me feel good now.")),
      sample("huge-compliment", "Huge compliment", fan("I follow a lot of creators, but yours are the only messages I keep unmuted. I look forward to hearing from you every day.")),
      sample("missed-live", "Missed live stream", fan("Are you going to stay live for a while?"), fan("Oh, it already ended. Hope I catch the next one.")),
    ],
  },
  {
    id: "flirting",
    title: "Sexting",
    samples: [
      sample("teasing", "Teasing", fan("You've been on my mind all day.")),
      sample("shy", "Shy fan", fan("I'm a little nervous to say this, but I think you're really beautiful.")),
      sample("late-night", "Late-night chat", fan("Can't sleep. Keep me company?")),
      sample("fantasy", "Detailed fantasy description", fan("Imagine we had a free weekend together, no phones, no plans."), fan("I'd start by cooking you breakfast and then spend the whole day just with you.")),
      sample("body-compliment", "Tight compliments", fan("Your last photos were stunning."), her("Aww you're sweet"), fan("That outfit really suits you.")),
      sample("missed", "Missed you", fan("I missed talking to you. Where have you been?")),
      sample("early-morning", "Early morning regret", her("Don't stop now"), fan("I'd love to keep going, but I have to be up early and I need to sleep soon.")),
      sample("hotel-room", "Hotel room fantasy", fan("I keep picturing us in a hotel room, city lights outside the window."), fan("Just the two of us, nowhere to be.")),
      sample("wall-pinning", "Wall pinning fantasy", fan("I imagine walking in and pulling you close the second the door shuts.")),
      sample("climax", "Climax request", her("You're getting me worked up"), fan("Same here, I can't stop smiling."), fan("Tell me you want me too, I'm so close to losing it.")),
      sample("anticipation", "Anticipation buildup", fan("I'm so impatient right now."), her("Good things come to those who wait"), fan("You're killing me"), her("Maybe a little more waiting"), fan("The view is worth it, I know it.")),
      sample("selling-while-sexting", "Selling while sexting", her("How badly do you want to see more?"), fan("Really badly, I'd love to see more of you.")),
      sample("naughty-mood", "Naughty mood", her("What are you up to tonight?"), fan("Nothing much."), her("Want to play a little game?"), fan("Sure, I'm getting in the mood.")),
      sample("kinky-fan", "Kinky fan", fan("You're unbelievably hot."), fan("Tell me what you'd do to me.")),
      sample("turned-on", "Turned-on fan", fan("I wish I could feel you right next to me tonight.")),
    ],
  },
  {
    id: "selling",
    title: "Selling",
    samples: [
      sample("curious", "Curious fan", her("I just sent you something special"), her("Hope you like it"), fan("That was the last of my money this week. Was it worth it?"), fan("It's nice. Do you show more than that in your sets?")),
      sample("payday", "Waiting for payday", fan("I don't have $200 right now."), fan("I get paid this week though. Can you save that set for me? You're a priority.")),
      sample("no-pressure", "No pressure", her("There's no pressure at all, babe"), fan("I know you're not pushy."), fan("I just have to watch my spending, but I'll treat you once I'm settled.")),
      sample("budget", "Limited budget", fan("I can't spend much right now. Anything under $50?")),
      sample("cheeky-offer", "Cheeky offer", fan("Your pics are so cute."), her("I have a little surprise for you"), fan("I love surprises."), her("Want a peek?"), fan("Sounds fun.")),
      sample("gentle-nudge", "Gentle nudge", her("Did you see what I sent?"), fan("Hmm."), fan("I can't buy anything else tonight.")),
      sample("flirty-upsell", "Flirty upsell", fan("I'm probably your best customer, right?"), her("You're definitely up there"), fan("I can't spend more tonight."), fan("Maybe $50 if it's really good.")),
      sample("too-expensive", "Too expensive complaint", fan("That is a lot for one video.")),
      sample("covered-photos", "Covered photos complaint", her("I just sent you 10 new pics"), fan("They were all covered up, though.")),
      sample("positive", "Positive feedback", her("Did you like the last set?"), fan("It was amazing."), fan("I'm into it, I wouldn't say no to more.")),
      sample("broke-rejection", "Broke rejection", her("Want to see the full set?"), fan("I'm broke right now."), fan("It's okay.")),
      sample("interested-broke", "Interested but broke", her("I have something new for you"), fan("I'm so sorry, I have no money until Friday."), fan("I'm still really interested though.")),
      sample("vip", "VIP content", her("Have you heard about my VIP?"), fan("How do I join?"), fan("What kind of content is in it?")),
      sample("free", "Free content", fan("Do you have anything free?")),
      sample("hesitation", "Price hesitation", her("The full set is $100"), fan("Hmm, I don't know if it's worth it.")),
      sample("not-paying", "Not paying for that", her("I have a new bikini set"), fan("Of course I'm interested."), fan("But I won't pay for a bikini picture, it's basic economics.")),
      sample("already-has", "Already bought it", her("As I checked your gallery, you don't have that set yet."), fan("I already bought something else tonight, though.")),
    ],
  },
];
/** The built-in samples; custom ones are counted from the account's items. */
export const TRAIN_TOTAL = TRAIN.reduce((n, c) => n + c.samples.length, 0);
export const trainDone = (train: Record<string, string>) => Object.values(train).filter((v) => v.trim()).length;
export const isBuiltInSample = (key: string) => TRAIN.some((c) => c.samples.some((s) => `${c.id}/${s.key}` === key));

// ---- targeting: which fans the writer may handle ("Choose who messages" for chats, "Exclude fans from Bump" for bumps)
export type ChatTargeting = {
  onlyOnLists: boolean;
  highSpender: { on: boolean; amount: number };
  newFans: { on: boolean; days: number };
  oldFans: { on: boolean; days: number };
  timeWasters: { on: boolean; noSpend: number; underAmount: number; underAfter: number; overAmount: number; overAfter: number };
  /** Fan lists (items of kind "fanlist"): `onlyLists` are the only ones messaged, `excludeLists` never are. */
  onlyLists: number[];
  excludeLists: number[];
};
export type BumpTargeting = { newFans: { on: boolean; days: number }; oldFans: { on: boolean; days: number }; excludeLists: number[] };
export type Targeting = { chats: ChatTargeting; bump: BumpTargeting };

// The greyed-out numbers in the form (5 days, 180 days, 20 and 25 messages, $100) are the defaults.
const DEFAULT_TARGETING: Targeting = {
  chats: { onlyOnLists: false, highSpender: { on: false, amount: 25 }, newFans: { on: false, days: 5 }, oldFans: { on: false, days: 180 }, timeWasters: { on: false, noSpend: 20, underAmount: 100, underAfter: 25, overAmount: 100, overAfter: 25 }, onlyLists: [], excludeLists: [] },
  bump: { newFans: { on: false, days: 5 }, oldFans: { on: false, days: 180 }, excludeLists: [] },
};
const num = (v: unknown, fallback: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v * 100) / 100)) : fallback);
const flag = (v: unknown) => v === true;
const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x > 0))].slice(0, 200) : []);
const days = (v: unknown, d: { on: boolean; days: number }) => { const o = (v ?? {}) as Record<string, unknown>; return { on: flag(o.on), days: Math.round(num(o.days, d.days, 3650)) }; };

/** Any saved value becomes a complete, valid targeting (missing parts take the defaults), so old or hand-edited data never breaks the screen. */
export function cleanTargeting(raw: unknown): Targeting {
  const r = (raw ?? {}) as { chats?: Record<string, any>; bump?: Record<string, any> };
  const c = r.chats ?? {}, b = r.bump ?? {}, D = DEFAULT_TARGETING;
  return {
    chats: {
      onlyOnLists: flag(c.onlyOnLists),
      highSpender: { on: flag(c.highSpender?.on), amount: num(c.highSpender?.amount, D.chats.highSpender.amount, 1_000_000) },
      newFans: days(c.newFans, D.chats.newFans),
      oldFans: days(c.oldFans, D.chats.oldFans),
      timeWasters: { on: flag(c.timeWasters?.on), noSpend: Math.round(num(c.timeWasters?.noSpend, D.chats.timeWasters.noSpend, 10_000)), underAmount: num(c.timeWasters?.underAmount, D.chats.timeWasters.underAmount, 1_000_000), underAfter: Math.round(num(c.timeWasters?.underAfter, D.chats.timeWasters.underAfter, 10_000)), overAmount: num(c.timeWasters?.overAmount, D.chats.timeWasters.overAmount, 1_000_000), overAfter: Math.round(num(c.timeWasters?.overAfter, D.chats.timeWasters.overAfter, 10_000)) },
      onlyLists: ids(c.onlyLists),
      excludeLists: ids(c.excludeLists),
    },
    bump: { newFans: days(b.newFans, D.bump.newFans), oldFans: days(b.oldFans, D.bump.oldFans), excludeLists: ids(b.excludeLists) },
  };
}

// ---- Advanced Settings (timing and hours; saved here, nothing sends on a timer yet)
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type DayMode = "off" | "on" | "custom";
type Range = { on: boolean; min: number; max: number };
export type Advanced = {
  delay: Range; // seconds, 20 to 180
  followUp: Range; // minutes, 2 to 30
  silentPpv: Range & { limitOn: boolean; exclusivity: number };
  unsend: { on: boolean; hours: number; minutes: number };
  noBumpHours: number;
  triggers: { online: boolean; purchase: boolean; engage: boolean };
  timezone: string;
  days: { mode: DayMode; from: string; to: string }[]; // Monday first
  respondWhenBack: boolean;
  /** What happens after a tip or a purchase: Jazz keeps the chat (bump and scripts on that event, a thank-you with a DIFFERENT offer), or a person takes over (the default, and the project's standing rule). */
  afterPayment: "jazz" | "person";
};
const DEFAULT_ADVANCED: Advanced = {
  delay: { on: true, min: 20, max: 50 },
  followUp: { on: true, min: 3, max: 6 },
  silentPpv: { on: false, min: 5, max: 10, limitOn: true, exclusivity: 3 },
  unsend: { on: true, hours: 0, minutes: 30 },
  noBumpHours: 4,
  triggers: { online: true, purchase: true, engage: true },
  timezone: "",
  days: DAYS.map(() => ({ mode: "on" as DayMode, from: "09:00", to: "17:00" })),
  respondWhenBack: false,
  afterPayment: "person",
};
const range = (v: unknown, d: Range, lo: number, hi: number): Range => {
  const o = (v ?? {}) as Record<string, unknown>;
  const a = Math.round(num(o.min, d.min, hi)), b = Math.round(num(o.max, d.max, hi));
  const min = Math.max(lo, Math.min(a, b)), max = Math.min(hi, Math.max(a, b, min));
  return { on: o.on === undefined ? d.on : flag(o.on), min, max };
};
const hhmm = (v: unknown, d: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
/** Any saved value becomes a complete, valid Advanced Settings (missing parts take the defaults). */
export function cleanAdvanced(raw: unknown): Advanced {
  const r = (raw ?? {}) as Record<string, any>, D = DEFAULT_ADVANCED;
  const on = (v: unknown, d: boolean) => (v === undefined ? d : flag(v));
  return {
    delay: range(r.delay, D.delay, 20, 180),
    followUp: range(r.followUp, D.followUp, 2, 30),
    silentPpv: { ...range(r.silentPpv, D.silentPpv, 2, 30), limitOn: on(r.silentPpv?.limitOn, true), exclusivity: Math.min(5, Math.max(1, Math.round(num(r.silentPpv?.exclusivity, 3, 5)))) },
    unsend: { on: on(r.unsend?.on, true), hours: Math.round(num(r.unsend?.hours, 0, 168)), minutes: Math.round(num(r.unsend?.minutes, 30, 59)) },
    noBumpHours: Math.round(num(r.noBumpHours, D.noBumpHours, 720)),
    triggers: { online: on(r.triggers?.online, true), purchase: on(r.triggers?.purchase, true), engage: on(r.triggers?.engage, true) },
    timezone: typeof r.timezone === "string" ? r.timezone.slice(0, 60) : "",
    days: D.days.map((d, i) => { const x = Array.isArray(r.days) ? (r.days[i] ?? {}) : {}; return { mode: (["off", "on", "custom"].includes(x.mode) ? x.mode : "on") as DayMode, from: hhmm(x.from, d.from), to: hhmm(x.to, d.to) }; }),
    respondWhenBack: flag(r.respondWhenBack),
    afterPayment: r.afterPayment === "jazz" ? "jazz" : "person",
  };
}

// ---- Flows (an automation drawn as a tree of steps; saved here, nothing runs yet)
export const FLOW_TRIGGERS = ["New Subscriber", "Expired Fan Followed", "Fan Total Spent Exceeded...", "Fan Tagged As...", `${AI_NAME} Escalations`] as const;
export const FLOW_CONDITIONS = [["replied", "Wait and check if the fan replied to the last message"], ["spent", "Check if the fan spent more/less than..."], ["purchased", "Wait and check if the fan purchased the last message"]] as const;
export type FlowKind = "start" | "delay" | "condition" | "message" | "tag" | "merge";
export type FlowNode = { id: string; kind: FlowKind; parent: string | null; branch: "true" | "false" | null; config: Record<string, string | number | boolean | { id: string; type: string; free?: boolean }[]> };
export type Flow = { title: string; nodes: FlowNode[]; exit: { superFan: boolean; spentOn: boolean; spent: number }; goal: { on: boolean; amount: number }; status: "draft" | "active" | "stopped"; editedAt: number };
const NODE_DEFAULT: Record<FlowKind, FlowNode["config"]> = {
  start: { trigger: FLOW_TRIGGERS[0], amount: 0, tag: "" },
  delay: { amount: 0, unit: "minutes" },
  condition: { type: "", waitSeconds: 0, amount: 0, more: true },
  message: { title: "", text: "", price: 0, aiPricing: false, skipIfBought: true, unsendOn: false, skipRecent: false, media: [] },
  tag: { tag: "" },
  merge: {},
};
const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; // unique inside one flow
export const blankFlow = (): Flow => ({ title: "Untitled", nodes: [{ id: "start", kind: "start", parent: null, branch: null, config: { ...NODE_DEFAULT.start } }], exit: { superFan: false, spentOn: false, spent: 0 }, goal: { on: false, amount: 0 }, status: "draft", editedAt: Date.now() });
export const flowKids = (nodes: readonly FlowNode[], id: string, branch: FlowNode["branch"] = null) => nodes.filter((n) => n.parent === id && n.branch === branch);
/** A new step after `parent` (in `branch` for a condition). The step that was there moves under the new one. */
export function flowAdd(nodes: readonly FlowNode[], parent: string, branch: FlowNode["branch"], kind: FlowKind): FlowNode[] {
  const node: FlowNode = { id: newId(), kind, parent, branch, config: { ...NODE_DEFAULT[kind] } };
  const next = nodes.map((n) => (n.parent === parent && n.branch === branch ? { ...n, parent: node.id, branch: null } : n));
  return [...next, node];
}
/** Takes a step out; its single follower takes its place. A condition takes everything under it with it. */
export function flowDelete(nodes: readonly FlowNode[], id: string): FlowNode[] {
  const gone = nodes.find((n) => n.id === id);
  if (!gone || gone.kind === "start") return [...nodes];
  if (gone.kind === "condition") {
    const drop = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of nodes) if (n.parent && drop.has(n.parent) && !drop.has(n.id)) { drop.add(n.id); grew = true; }
    }
    return nodes.filter((n) => !drop.has(n.id));
  }
  return nodes.filter((n) => n.id !== id).map((n) => (n.parent === id ? { ...n, parent: gone.parent, branch: gone.branch } : n));
}
export function flowDuplicate(nodes: readonly FlowNode[], id: string): FlowNode[] {
  const src = nodes.find((n) => n.id === id);
  if (!src || src.kind === "start" || src.kind === "condition") return [...nodes];
  const added = flowAdd(nodes, src.id, null, src.kind);
  const copyId = added.at(-1)!.id;
  return added.map((n) => (n.id === copyId ? { ...n, config: { ...src.config } } : n));
}
export const FLOW_TEMPLATES = [
  { id: "expired", title: "Expired Fans Flow", text: "Reconnect with expired fans, offering exclusive content and irresistible deals to encourage them to resubscribe." },
  { id: "subscriber", title: "New Subscriber Funnel", text: "Welcome your fans warmly, then introduce exclusive content offers to encourage their first purchases and keep them chatting." },
] as const;
/** A ready-made flow (its messages are plain starting texts to edit). An unknown id gives an empty flow. */
export function flowFromTemplate(id: string): Flow {
  const flow = blankFlow();
  const t = FLOW_TEMPLATES.find((x) => x.id === id);
  if (!t) return flow;
  const last = (nodes: FlowNode[]) => nodes.at(-1)!;
  const patch = (nodes: FlowNode[], config: FlowNode["config"]) => nodes.map((n) => (n.id === last(nodes).id ? { ...n, config: { ...n.config, ...config } } : n));
  let nodes = flow.nodes;
  if (id === "expired") {
    nodes = patch(nodes.map((n) => (n.kind === "start" ? { ...n, config: { ...n.config, trigger: "Expired Fan Followed" } } : n)), {});
    nodes = patch(flowAdd(nodes, "start", null, "delay"), { amount: 1, unit: "hours" });
    nodes = patch(flowAdd(nodes, last(nodes).id, null, "message"), { title: "We miss you", text: "Hey {name}, I miss having you here 💕 I have something special waiting for you if you come back." });
  } else {
    nodes = patch(flowAdd(nodes, "start", null, "delay"), { amount: 2, unit: "minutes" });
    nodes = patch(flowAdd(nodes, last(nodes).id, null, "message"), { title: "Welcome", text: "Hey {name}! So happy you're here 💕 What made you subscribe?" });
    nodes = patch(flowAdd(nodes, last(nodes).id, null, "condition"), { type: "replied", waitSeconds: 600 });
    const cond = last(nodes).id;
    nodes = patch(flowAdd(nodes, cond, "true", "message"), { title: "Thanks for chatting", text: "I love chatting with you {name}! Want to see something I made just for my favourite fans?" });
    nodes = patch(flowAdd(nodes, cond, "false", "message"), { title: "Nudge", text: "Hey {name}, did you see my message? 😘" });
  }
  return { ...flow, title: t.title, nodes };
}
export const flowLabel = (n: FlowNode): string =>
  n.kind === "start" ? "Starting Event" : n.kind === "delay" ? (Number(n.config.amount) > 0 ? `Wait for ${n.config.amount}${String(n.config.unit)[0]}` : "Time Delay") : n.kind === "condition" ? "Condition" : n.kind === "message" ? "Send Message" : n.kind === "tag" ? "Tag Fan" : "Merge Nodes";
export function flowDetail(n: FlowNode): string {
  const c = n.config;
  if (n.kind === "start") return String(c.trigger);
  if (n.kind === "condition") return c.type === "spent" ? `Check if the fan spent ${c.more ? "more" : "less"} than $${c.amount}` : c.type ? `Wait ${c.waitSeconds}s, then check if ${c.type === "replied" ? "replied to" : "purchased"} last message` : "Choose a condition";
  if (n.kind === "message") return String(c.title || "");
  if (n.kind === "tag") return String(c.tag || "");
  return "";
}
/** What still has to be filled in before a flow can be set live (empty = ready). */
export function flowIssues(f: Flow): string[] {
  const out: string[] = [];
  for (const n of f.nodes) {
    const c = n.config;
    if (n.kind === "delay" && !(Number(c.amount) > 0)) out.push("Set how long to wait");
    if (n.kind === "condition" && !c.type) out.push("Choose a condition");
    if (n.kind === "message" && (!String(c.title).trim() || !String(c.text).trim())) out.push("Finish the message");
    if (n.kind === "tag" && !String(c.tag).trim()) out.push("Name the tag");
  }
  if (!f.nodes.some((n) => n.kind === "message")) out.push("Add a message");
  return out;
}

// ---- Fan list rules (a list defined by rules over the fans we know: spend, last message, subscribe date, who is handling them)
export const FAN_FIELDS = [
  { key: "spend", label: "Total spend on all creators", kind: "number", tip: "What the fan has spent in total, in dollars." },
  { key: "lastMessage", label: "Days Since Last Message", kind: "number", tip: "Days since the fan or the creator last wrote." },
  { key: "subscribed", label: "Days Since Subscribed", kind: "number", tip: "Days since the fan subscribed (known after their spend has been looked up)." },
  { key: "jazz", label: `${AI_NAME} Status`, kind: "select", options: [["assistant", `${AI_NAME} is writing drafts`], ["human", "A person has the chat"]], tip: "Who is handling the chat right now." },
  { key: "escalation", label: "Escalation", kind: "select", options: [["yes", "Handed to a person"], ["no", "Not handed over"]], tip: "Whether the chat was handed to a person (needs_human, a tip, a big spender...)." },
] as const;
type FanField = (typeof FAN_FIELDS)[number]["key"];
export const NUMBER_OPS = [[">", "Greater than"], ["<", "Less than"], ["=", "Equals"]] as const;
export type Rule = { field: FanField; op: ">" | "<" | "="; value: string };
export type RuleGroup = { match: "all" | "any"; rules: (Rule | RuleGroup)[] };
export const blankRule = (): Rule => ({ field: "spend", op: ">", value: "0" });
export const blankGroup = (): RuleGroup => ({ match: "all", rules: [] });
const isGroup = (x: Rule | RuleGroup): x is RuleGroup => "rules" in x;
const FIELD = new Map<string, (typeof FAN_FIELDS)[number]>(FAN_FIELDS.map((f) => [f.key, f]));
/** Any saved or sent value becomes a valid group (unknown fields and bad values are dropped; groups nest two levels at most). */
export function cleanGroup(raw: unknown, depth = 0): RuleGroup {
  const r = (raw ?? {}) as { match?: unknown; rules?: unknown };
  const rules: RuleGroup["rules"] = [];
  for (const x of Array.isArray(r.rules) ? r.rules.slice(0, 20) : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    if (Array.isArray(o.rules)) { if (depth < 1) rules.push(cleanGroup(o, depth + 1)); continue; }
    const f = FIELD.get(String(o.field));
    if (!f) continue;
    const value = String(o.value ?? "").slice(0, 20);
    if (f.kind === "select") { if ((f.options as readonly (readonly [string, string])[]).some(([v]) => v === value)) rules.push({ field: f.key, op: "=", value }); continue; }
    if (!Number.isFinite(Number(value)) || value.trim() === "") continue;
    rules.push({ field: f.key, op: [">", "<", "="].includes(String(o.op)) ? (o.op as Rule["op"]) : ">", value });
  }
  return { match: r.match === "any" ? "any" : "all", rules };
}
export const countRules = (g: RuleGroup): number => g.rules.reduce((n, x) => n + (isGroup(x) ? countRules(x) : 1), 0);

// ---- what the writer is told about the creator (built from the Bio, Train answers, Live updates and Products)
type Written = { fan: string[]; her: string };
const TRAILING_EMOJI = /\s[^\u0000-\u007F]+$/u; // some questions end in an emoji
const FIELD_LABEL = new Map(BIO_SECTIONS.flatMap((x) => x.fields).map((x) => [x.key, x.label.replace(TRAILING_EMOJI, "")]));
const answer = (v: BioValue | undefined) => (Array.isArray(v) ? v.join(", ") : (v ?? "").trim());
const SLIDER_SENTENCE: Record<string, (v: string) => string> = {
  writing_level: (v) => (v === "Relaxed" ? "Writing level: relaxed and conversational, short messages, contractions." : v === "Proper" ? "Writing level: proper, well-formed sentences." : "Writing level: a mix of relaxed and proper."),
  explicitness: (v) => `Explicitness level the creator chose: ${v.toLowerCase()}.`,
  punctuation: (v) => (v === "Minimal" ? "Punctuation: almost none (no full stops, few commas)." : v === "Proper" ? "Punctuation: correct and complete." : "Punctuation: light and casual."),
  capitalization: (v) => (v === "Lowercase" ? "Capitalization: write everything in lowercase letters, even names and the word i." : v === "Proper" ? "Capitalization: normal capitalization." : "Capitalization: capitalise only names; keep everything else lowercase."),
};
/** The personal facts the writer may use, as "Question: answer" lines (only what was answered). */
const FACT_KEYS = ["name", "nicknames", "gender", "birth_date", "relationship", "orientation", "country", "city", "traveling", "grew_up", "work", "prev_jobs", "languages", "education", "children", "pets", "siblings", "religion", "ideology", "online_persona", "other_info", "dreams", "hobbies", "workout", "typical_day", "morning", "night", "weekends", "fav_food", "fav_drink", "fav_color", "fav_music", "fav_books", "fav_movies", "drinking", "smoking", "funny_story", "facts", "sports", "body_type", "ethnicity", "hair", "eyes", "height", "weight", "tattoos", "piercings", "niche", "content_offered", "why_started", "attracted_to", "like_in_them", "turns_on", "open_relationships", "social_platforms", "handles"];
/** What a fan's words ask for, as Bio fact keys: "how old" asks for the birth date, "where are you from" for the country and city, and so on. */
const FACT_STOP = new Set(["what", "have", "does", "your", "with", "from", "that", "this", "there", "where", "when", "which", "would", "could", "about", "right", "many", "currently"]);
const FACT_ASKS: [RegExp, string[]][] = [
  [/\b(old|age|birthday|born|birth)\b/i, ["birth_date"]],
  [/\b(where|from|live|city|country|town|located|location|based)\b/i, ["country", "city", "grew_up", "traveling"]],
  [/\b(job|work|do for a living|career|profession|study|school|college)\b/i, ["work", "prev_jobs", "education"]],
  [/\b(pet|pets|dog|cat|puppy)\b/i, ["pets"]],
  [/\b(kids?|children|baby|mom|mother)\b/i, ["children"]],
  [/\b(boyfriend|girlfriend|husband|wife|married|single|relationship|dating|partner|taken)\b/i, ["relationship", "open_relationships", "orientation"]],
  [/\b(brothers?|sisters?|siblings?|family)\b/i, ["siblings"]],
  [/\b(languages?|speak|spanish|english|french)\b/i, ["languages"]],
  [/\b(hobby|hobbies|free time|fun|weekend|weekends|gym|workout|sport|sports)\b/i, ["hobbies", "workout", "weekends", "sports", "typical_day"]],
  [/\b(eat|food|favorite food|cook|drink|coffee|wine)\b/i, ["fav_food", "fav_drink", "drinking"]],
  [/\b(music|song|singer|movie|film|show|book|read)\b/i, ["fav_music", "fav_movies", "fav_books"]],
  [/\b(tall|height|weigh|weight|body|hair|eyes|tattoos?|piercings?|ethnic|look)\b/i, ["height", "weight", "body_type", "hair", "eyes", "tattoos", "piercings", "ethnicity"]],
  [/\b(smoke|smoking|drinks?|drinking)\b/i, ["smoking", "drinking"]],
  [/\b(name|called|nickname|call you)\b/i, ["name", "nicknames"]],
  [/\b(relig\w*|god|church|pray|prayer|faith|christian|muslim|atheist|belie\w*|politic\w*|vote|voting)\b/i, ["religion", "ideology"]],
  [/\b(morning|night|day|routine)\b/i, ["morning", "night", "typical_day"]],
  [/\b(why|start|started|onlyfans|content)\b/i, ["why_started", "content_offered", "niche"]],
];
/** A fan's message that asks about HER (age, where she is from, work, pets...): the answer is in her Bio facts. */
export const asksAboutHer = (text: string) => FACT_ASKS.slice(0, -2).some(([re]) => re.test(text));
const list = (items: string[]) => items.map((x) => `- ${x}`).join("\n");

export function buildWriterContext(i: { bio: BioValues; train: Record<string, string>; customSamples: { id: number; title: string; fan: string[] }[]; updates: string[]; products: { name: string; price: number; description: string; tags: string[]; progression: number }[]; scripts?: { name: string; trigger: string; steps: string[] }[]; maxExamples?: number; maxChars?: number; focus?: string; typicalWords?: number }): string {
  const b = i.bio;
  const out: string[] = [];
  if (i.updates.length) out.push("What she is doing / what is going on right now (use this when asked about her plans, weekend or news):\n" + list(i.updates));
  const voice: string[] = [];
  if (answer(b.persona)) voice.push(`Persona: ${answer(b.persona)}.`);
  if (answer(b.strategy)) voice.push(`Chatting strategy: ${answer(b.strategy)}.`);
  for (const [k, say] of Object.entries(SLIDER_SENTENCE)) if (answer(b[k])) voice.push(say(answer(b[k])));
  if (answer(b.laughter)) voice.push(`She laughs in text like: ${answer(b.laughter)}.`);
  if (answer(b.slang)) voice.push(`Her slang: ${answer(b.slang)}.`);
  if (answer(b.emojis)) voice.push(`Her emojis: ${answer(b.emojis)}. This is how she really texts: put one or two of these in most replies, picked to fit the mood of that moment (flirty, playful, warm, teasing), never in every sentence and never emojis outside this list.`);
  if (answer(b.fan_nicknames)) voice.push(`She calls fans: ${answer(b.fan_nicknames)}.`);
  if (answer(b.fan_feel)) voice.push(`She wants fans to feel: ${answer(b.fan_feel)}.`);
  if (answer(b.love_topics)) voice.push(`She loves talking about: ${answer(b.love_topics)}.`);
  if (answer(b.multilingual).startsWith("On")) voice.push("Reply in the fan's own language.");
  if (voice.length) out.push("How she writes:\n" + list(voice));

  const limits: string[] = [];
  if (answer(b.avoid_topics)) limits.push(`Topics to avoid or handle with care: ${answer(b.avoid_topics)}`);
  if (answer(b.avoid_words)) limits.push(`Never use these words or phrases: ${answer(b.avoid_words)}`);
  if (answer(b.red_lines)) limits.push(`Red lines (never offer or discuss): ${answer(b.red_lines)}`);
  limits.push(answer(b.not_creator_reply) ? `If a fan says they are not talking to the creator, answer along these lines: ${answer(b.not_creator_reply)}` : "If a fan says they are not talking to the creator, or asks if this is a bot or AI, set needs_human = true.");
  out.push("Limits:\n" + list(limits));

  // Her personal facts come BEFORE the long blocks (products, scripts, examples), so a size cap never cuts them off.
  // The ones that answer what the fan just asked go first (a question about her age, city, job or pets finds its fact at the top).
  const factRows = FACT_KEYS.map((k) => ({ k, v: answer(b[k]) })).filter((x) => x.v);
  if (factRows.length) {
    const asked = words(i.focus ?? "");
    const wants = (x: { k: string; v: string }) => {
      let n = 0;
      for (const [re, keys] of FACT_ASKS) if (re.test(i.focus ?? "") && keys.includes(x.k)) n += 5;
      for (const w of words(`${FIELD_LABEL.get(x.k) ?? x.k} ${x.v}`)) if (w.length >= 4 && !FACT_STOP.has(w) && asked.has(w)) n++;
      return n;
    };
    const ageOf = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if (!m) return null; const now = new Date(); let a = now.getFullYear() - Number(m[1]); if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) a--; return a >= 18 && a < 100 ? a : null; };
    for (const x of factRows) if (x.k === "birth_date") { const a = ageOf(x.v); if (a !== null) x.v = `${x.v} (she is ${a} years old)`; }
    const ranked = factRows.map((x, idx) => ({ x, idx, n: wants(x) })).sort((a, c) => c.n - a.n || a.idx - c.idx);
    // a budget for the facts, so the products, scripts and examples after them still fit on a small model (the most relevant facts are kept)
    const budget = Math.floor((i.maxChars ?? 14000) * 0.4);
    let used = 0;
    const lines: string[] = [];
    for (const { x } of ranked) { const line = `${FIELD_LABEL.get(x.k) ?? x.k}: ${x.v.slice(0, 160)}`; if (used + line.length > budget && lines.length) break; lines.push(line); used += line.length + 3; }
    out.push("About her (use these facts, never invent others; the first ones answer what the fan just asked):\n" + list(lines));
  }

  const offered = Array.isArray(b.services) ? b.services : [];
  const notOffered = SERVICES.filter((x) => !offered.includes(x));
  const services = [offered.length ? `Services she offers: ${offered.join("; ")}.` : "", answer(b.other_services) ? `Other services: ${answer(b.other_services)}.` : "", offered.length && notOffered.length ? `Services she does NOT offer (if a fan asks, politely say it is not available and keep chatting): ${notOffered.join("; ")}.` : ""].filter(Boolean);
  if (services.length) out.push("Services:\n" + list(services));

  if (i.products.length) {
    const sorted = [...i.products].sort((x, y) => x.progression - y.progression);
    out.push("Products she sells RIGHT NOW (these are always for sale, whatever the services lists say). When a fan asks what she has, or asks for something that matches one, name the product and give its exact price, say it is a pay-to-unlock message, and ask if they want it. Offer lower progression numbers first. Quote only these prices:\n" + list(mostRelevant(sorted.map((p) => ({ ...p, fan: [p.name, p.tags.join(" "), p.description] })), i.focus, 6).map((p) => `${p.name}: $${p.price}${p.description ? `. ${p.description.slice(0, 120)}` : ""}${p.tags.length ? ` (topics: ${p.tags.slice(0, 4).join(", ")})` : ""}`)));
  }

  if (i.scripts?.length) {
    const fitting = mostRelevant(i.scripts.map((x) => ({ ...x, fan: [x.trigger, x.name] })), i.focus, 2);
    out.push("Scripts she uses (when the chat matches a script's trigger, follow its steps in order, in her voice, one step at a time):\n" + list(fitting.map((x) => `${x.name} - starts when: ${x.trigger}. Steps: ${x.steps.map((st, n) => `${n + 1}) ${st}`).join(" ")}`)));
  }


  const examples = trainExamples(i.train, i.customSamples);
  if (i.typicalWords) out.push(`How long her real texts are: about ${i.typicalWords} words each, one or two short lines. Write the same length, never more than twice that.`);
  const shown = mostRelevant(examples, i.focus, i.maxExamples ?? 12);
  if (shown.length) out.push("Examples of how she really replies (match this voice and length; do NOT copy her sentences, greetings or openers word for word):\n" + shown.map((e) => `Fan: ${e.fan.join(" / ")}\nHer: ${e.her}`).join("\n\n"));
  if (shown.length < 3) out.push("She has not written her own examples yet. This is the TEXTING STYLE to copy (casual, flirty, short, curious about the fan; never like customer support). Use her persona, nicknames and facts instead of these exact words:\n" + GENERIC_VOICE.map((e) => `Fan: ${e.fan}\nHer: ${e.her}`).join("\n\n"));
  return out.join("\n\n").slice(0, i.maxChars ?? 14000);
}

/** Her answers in Train, each with the fan messages it answers. */
function trainExamples(train: Record<string, string>, customSamples: { id: number; fan: string[] }[]): Written[] {
  const examples: Written[] = [];
  for (const c of TRAIN) {
    for (const sm of c.samples) {
      const her = train[`${c.id}/${sm.key}`]?.trim();
      if (her) examples.push({ fan: sm.turns.filter((t) => t.from === "fan").map((t) => t.text), her });
    }
  }
  for (const cs of customSamples) {
    const her = train[`custom/${cs.id}`]?.trim();
    if (her) examples.push({ fan: cs.fan, her });
  }
  return examples;
}
/** The saved answer of hers that fits what the fan wrote best, or null. Used as the reply when the model refuses a normal flirty message. */
export function closestAnswer(train: Record<string, string>, customSamples: { id: number; fan: string[] }[], focus: string): string | null {
  const asked = words(focus);
  const near = trainExamples(train, customSamples).map((e) => ({ e, n: [...words(e.fan.join(" "))].filter((w) => asked.has(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  return near[0]?.e.her ?? null; // null when none of her saved samples is about what he asked
}

const STOPW = new Set(["you", "your", "yours", "the", "and", "what", "whats", "what's", "are", "was", "this", "that", "with", "have", "for", "babe", "baby", "hey", "can", "does", "did", "its", "it's", "get", "got", "just", "like", "any", "some", "about", "tell", "please", "want", "would", "could", "from", "there", "here", "when", "how", "who", "why"]);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []).filter((w) => !STOPW.has(w)));
/** The `max` examples whose fan side shares the most words with what the fan just wrote (the others keep their order). Without a message: the first `max`. */
function mostRelevant<T extends { fan: string[] }>(examples: T[], focus: string | undefined, max: number): T[] {
  const f = focus ? words(focus) : null;
  if (!f || f.size === 0 || examples.length <= max) return examples.slice(0, max);
  const score = (e: T) => { let n = 0; for (const w of words(e.fan.join(" "))) if (f.has(w)) n++; return n; };
  return examples.map((e, k) => ({ e, k, s: score(e) })).sort((a, b) => b.s - a.s || a.k - b.k).slice(0, max).map((x) => x.e);
}

// Hand-written examples of the texting style (not her words): used only until she has filled in her own Train answers.
const GENERIC_VOICE = [
  { fan: "hi", her: "heyy you 😘 i was just thinking about who'd text me tonight. how's your day been?" },
  { fan: "hey, how are you?", her: "better now that you're here 😉 just got comfy on the couch. what are you up to?" },
  { fan: "what are you doing?", her: "nothing much, lying in bed being lazy 🙈 wish i had some company. what about you?" },
  { fan: "you're so pretty", her: "aww stop, you're making me blush 😊 tell me more, what else do you like about me?" },
] as const;

/** How many times the fan wrote since `since` (their last purchase; 0 = from the start of the chat). Several messages in a row count as one. */
export function fanTurnsSince(messages: readonly { source: string; created_at: number }[], since: number | null): number {
  let turns = 0;
  let prevFan = false;
  for (const m of messages) {
    if (m.created_at <= (since ?? 0)) continue;
    const fan = m.source === "fan";
    if (fan && !prevFan) turns++;
    prevFan = fan;
  }
  return turns;
}

/** Fixes a reply in code where a small model is unreliable: the fan's @username is never used as a name, and "Lowercase" capitalization is applied as chosen. */
export function polishReply(reply: string, o: { username?: string | null; lowercase: boolean; emojis?: string[]; maxWords?: number }): string {
  // The notes we add to her earlier texts for the writer ((a bump message), (locked PPV $9 with 2 media)) are never part of what the fan reads: a model that copies one has it removed.
  reply = reply.replace(/\s*\((?:an? (?:bump|mass|script)[^)]*|locked PPV[^)]*|\d+ media[^)]*|a script step[^)]*)\)/gi, "");
  const mention = (name: string) => new RegExp(`,?\\s*@${name}\\b([,!]?)`, "gi"); // "Hey there, @bob!" -> "Hey there!"
  let t = reply.trim();
  if (o.username) t = t.replace(mention(o.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "$1");
  t = t.replace(mention("\\w+"), "$1").replace(/\s+([,!?.])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
  if (o.maxWords && t.split(/\s+/).length > o.maxWords) {
    // a real text is short: keep whole sentences while they fit (at least the first one)
    const parts = t.match(/[^.!?\n]+[.!?]*\s*/g) ?? [t];
    let kept = "";
    for (const s of parts) { if (kept && (kept + s).trim().split(/\s+/).length > o.maxWords) break; kept += s; }
    t = kept.trim();
  }
  if (o.emojis?.length && t) {
    // Her emojis are how she texts: an emoji that is not hers is swapped out, and a reply with none of hers gets one.
    const hers = new Set(o.emojis);
    const EMOJI = /\p{Extended_Pictographic}\uFE0F?/gu;
    const foreign = (t.match(EMOJI) ?? []).filter((e) => !hers.has(e) && !hers.has(e.replace("\uFE0F", "")));
    for (const e of foreign) t = t.replace(e, "");
    t = t.replace(/[ \t]{2,}/g, " ").trim();
    if (!(t.match(EMOJI) ?? []).some((e) => hers.has(e) || hers.has(e.replace("\uFE0F", "")))) {
      const pick = o.emojis[[...t].reduce((h, c) => h + c.charCodeAt(0), 0) % o.emojis.length]!;
      t = `${t.replace(/[\s]+$/, "")} ${pick}`;
    }
  }
  return o.lowercase ? t.toLowerCase() : t;
}

// ---- questions only a person answers (the writer is never asked: shared by the server and the Try Jazz simulator)
/** True if the fan asks whether they are talking to a bot, an AI or a real person. A person answers that, not the model. */
export function isBotQuestion(text: string): boolean {
  return /\b(are|r)\s+(you|u|ya)\s+(a\s+|an\s+|the\s+)?(real|actual|human|bot|robot|ai|chatbot|chat\s?bot|automated|fake|person|machine)\b|\b(is|am)\s+(this|that|it|i)\s+(a\s+|an\s+)?(real|actual|bot|ai|robot|chatbot|automated|fake|talking|chatting)\b|\b(talking|chatting|speaking)\s+(to|with)\s+(a\s+|an\s+)?(real|actual|human|bot|ai|robot|chatbot|machine|person)\b|\breal\s+(person|human|girl|woman)\b|\b(chat)?bot\b|\bartificial\b|\bchatgpt\b/i.test(text);
}
/** A fan asks for a promise or a fact only the creator can give (takedowns, legality, refunds, authenticity). The model should not answer these, so a person does, without a model call. */
export function asksForFacts(text: string): boolean {
  return /\b(taken down|take (it |them )?down|got (banned|deleted|removed)|banned|dmca|illegal|is (this|it|that) legal|scam|fake|verified|guarantee|refund|chargeback|promise me|will (it|that) happen again|is it safe)\b/i.test(text);
}

/** A fan asking for something made just for him: the creator has to confirm it, so a person answers. */
const CUSTOM_RX = /\b(custom|personali[sz]ed (video|vid|pic|photo)|make (me )?(a|an) (video|vid)|(video|vid) (with|saying) my name|just for me)\b/i;
export const isCustomRequest = { test: (t: string) => CUSTOM_RX.test(t) };
