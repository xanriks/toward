/* How We Connect: content.
   All the words the app uses for scenarios, the check-in, and styles live here,
   so they can be edited without touching app logic. */
var SCENES = [
  { id:"vuln", label:"One of us shares something vulnerable",
    reach:{ inside:"A drop in the chest. Quiet back feels like a verdict: I said too much, they don’t care.",
      lands:"Following up, explaining more, or asking “are we okay?” can feel cornering, and the quiet gets deeper.",
      self:"Say it once, then let it sit. Breathe. The quiet isn’t the answer yet.",
      us:"Try: “No need to respond now. I just wanted you to know.”" },
    pull:{ inside:"A rush of feeling that’s hard to sort. Words go blank. Quiet feels safer than saying the wrong thing.",
      lands:"The silence can feel like rejection, even when it’s really overwhelm.",
      self:"Notice the blank. It’s flooding, not a lack of care.",
      us:"Try: “I heard you. I need a little time. Can we talk tomorrow?” Then come back." } },
  { id:"touch", label:"One of us wants physical closeness or sex",
    reach:{ inside:"Wanting to feel chosen. A no or a pause can land as “you don’t want me.”",
      lands:"Asking while things feel tense can feel like one more demand.",
      self:"Your desire is valid even when the timing isn’t. Hold both.",
      us:"Start smaller: a hug, a hand, sitting close with no expectation." },
    pull:{ inside:"Closeness can feel like a lot when you’re already full. Desire goes quiet ahead of time.",
      lands:"Pulling back from touch can feel like being unwanted.",
      self:"Ask what would make closeness easier, not whether you “should” want it.",
      us:"Offer what you can: “Not tonight, but I’d love to lie here with you.”" } },
  { id:"text", label:"A text goes unanswered for hours",
    reach:{ inside:"The mind fills the gap with the worst story. Each hour feels heavier.",
      lands:"Several follow-ups can feel like being watched or chased.",
      self:"Send one text. Then put the phone away and do something with your hands.",
      us:"Agree on a norm: a quick “busy, will reply later” helps a lot." },
    pull:{ inside:"You just got busy. A heavy message can feel like homework.",
      lands:"Hours of silence can feel like a door closing.",
      self:"A two-word reply counts. You don’t have to answer fully now.",
      us:"Try: “Saw this. Let’s talk tonight.” It buys time and keeps connection." } },
  { id:"night", label:"A hard talk starts late at night",
    reach:{ inside:"It’s been building all day. Now there’s finally a chance, and it feels urgent.",
      lands:"Late, tired, and serious can feel like an ambush, even when it isn’t meant that way.",
      self:"Write the feeling down tonight. It will still be true tomorrow.",
      us:"Try: “Can we find 15 minutes tomorrow? Something’s on my heart.”" },
    pull:{ inside:"Tired body, full head. A hard talk now feels impossible.",
      lands:"Shutting it down can feel like the topic will never come up.",
      self:"Say no to the timing, not to the person.",
      us:"Try: “I can’t do this well tonight. Tomorrow after dinner?” Then keep it." } },
  { id:"good", label:"Things have been really good lately",
    reach:{ inside:"Relief, and a quiet fear of losing it. You might hold on tighter.",
      lands:"Leaning in harder during a good stretch can tip a partner into needing space.",
      self:"Enjoy it without testing it. Good doesn’t need proof.",
      us:"Name it lightly: “I’ve really liked this week with you.” Then let it be." },
    pull:{ inside:"Things feel close, and oddly, that’s when the urge for space shows up.",
      lands:"Pulling back right after closeness can feel confusing and painful.",
      self:"Distance right after closeness is often protection, not a change of heart.",
      us:"Try: “This has been good. I need a bit of me-time, and I’m not going anywhere.”" } }
];

var ITEMS = [
  {t:"When my partner is quiet or distant, I worry something is wrong between us.", d:"a"},
  {t:"I feel uneasy when my partner wants to talk about feelings.", d:"v"},
  {t:"An unanswered text can stay on my mind for hours.", d:"a"},
  {t:"When things get very close, I want some space.", d:"v"},
  {t:"I need reassurance that I’m loved.", d:"a"},
  {t:"I’d rather handle problems on my own.", d:"v"},
  {t:"I worry my partner doesn’t care as much as I do.", d:"a"},
  {t:"It’s hard for me to show my partner how I feel deep down.", d:"v"},
  {t:"After a disagreement, I fear it could hurt us for good.", d:"a"},
  {t:"I find it hard to depend on my partner.", d:"v"}
];
var SCALE = ["Not like me","A little like me","Somewhat like me","Mostly like me","Very like me"];

var STYLES = {
  anxious:{ name:"Anxious", nick:"Reaches for closeness", side:"reach", move:"reach harder",
    desc:"When closeness feels uncertain, your system turns up. You reach, check in, explain, and look for reassurance.",
    roots:"Often grows where love felt unpredictable: there one moment, gone the next. A child learns to watch closely and reach harder.",
    lands:"Lots of words or urgency can feel like pressure.",
    helps:"Small, clear reassurance and a time you’ll come back.",
    moves:["Say one feeling and one ask, then stop.","When the urge to check in hits, wait 20 minutes and breathe first.","Soothe yourself first: a walk, breathing, writing it down."] },
  avoidant:{ name:"Avoidant", nick:"Needs space to feel safe", side:"pull", move:"go quiet and need space",
    desc:"When closeness gets intense, your system turns down. Feelings go quiet, and space brings relief.",
    roots:"Often grows where needs weren’t met or feelings weren’t welcome. A child learns: handle it yourself, stay strong.",
    lands:"Going quiet can feel like rejection.",
    helps:"Fewer words, a calm tone, side-by-side settings like a drive or walk, and room to answer later.",
    moves:["Notice when feelings go flat, and name it out loud.","Say “I need a break, I’ll come back at [time],” then come back.","Share one small feeling a day. “I’m tired” counts."] },
  fearful:{ name:"Fearful", nick:"Wants closeness and fears it", side:"pull", move:"reach, then pull back",
    desc:"You want closeness and fear it at the same time. You may reach, then pull away, then miss them.",
    roots:"Often grows where the people you needed were also unpredictable or frightening. Closeness and danger got wired together.",
    lands:"The back-and-forth can leave a partner unsure where they stand.",
    helps:"Steady presence without pressure, and patience with the swing.",
    moves:["When you swing, name which way: “I’m pulling back right now.”","Take space without ending things in your head.","Notice the longing that comes back. That feeling is real too."] },
  secure:{ name:"Secure", nick:"Mostly steady", side:"reach", move:"stay mostly steady",
    desc:"Closeness and space both feel mostly okay. You can ask for what you need and give room.",
    roots:"Often grows where care was steady enough, or through healing later in life.",
    lands:"Steadiness usually helps a partner settle.",
    helps:"Honesty and showing up. They’ll meet you there.",
    moves:["Keep naming what you notice, kindly.","Don’t carry all the repair work alone.","Protect your own needs too."] }
};

var PAIRS = {
  "anxious|avoidant":{ text:"The classic pursue-and-withdraw loop. One of you turns up, the other turns down, and each move sets off the next. Underneath, you share the same fear: losing connection. You just protect against it in opposite directions.", move:"Agree on a pause signal with a promised return time, like “break, back at 8.”" },
  "anxious|fearful":{ text:"You both feel the pull toward closeness, and both fear losing it. When things get intense, one of you reaches harder while the other may swing away, and that swing sets off the reacher’s alarm.", move:"When one of you pulls back, the other says “I’m here when you’re ready” once, then waits." },
  "anxious|anxious":{ text:"You both reach. Closeness comes easily, but so does alarm. When you’re both scared at once, small things can grow fast.", move:"Take turns: one talks for two minutes, the other just listens, then switch." },
  "avoidant|avoidant":{ text:"You both value space and calm. Things can feel peaceful, but you may drift into living side by side without touching each other’s inner worlds.", move:"Put one 10-minute “how are we, really?” talk on the calendar each week." },
  "avoidant|fearful":{ text:"When the fearful partner reaches, the avoidant partner may turn down, and then the fearful partner pulls away too. You can end up both distant and both quietly lonely.", move:"One small bid a day each: a touch, a question, a shared joke." },
  "fearful|fearful":{ text:"You both want closeness and both fear it. You may take turns reaching and retreating, like a wave. Naming the swing out loud helps.", move:"Use a shared phrase for the swing, like “I’m in my wave,” so it isn’t taken personally." },
  "secure|X":{ text:"One of you brings steadiness. That gives the other room to calm down and come back. The work is keeping it shared, so the steady one isn’t carrying everything.", move:"The steady one asks for something too, at least once a week." },
  "secure|secure":{ text:"You both tend to stay steady. Keep doing what works: honest asks, real repair, and time just for the two of you.", move:"Keep a weekly check-in, even when things are good." }
};
var TOGETHER = ["Name the cycle, not the person: “We’re doing the loop again.”","Once a week, a side-by-side check-in on a drive or walk: one high, one hard, one thing you appreciated."];

var LOG_TAGS = [
  { id:"win", label:"Something good" },
  { id:"bid", label:"A bid for connection" },
  { id:"loop", label:"We hit the loop" },
  { id:"repair", label:"A repair" },
  { id:"hard", label:"A hard moment" },
  { id:"note", label:"Just a note" }
];
