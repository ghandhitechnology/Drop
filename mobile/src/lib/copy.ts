/**
 * Every user-facing string in Drop lives here.
 *
 * Voice rules, enforced by review:
 *  - No disclaimers, no hedging paragraphs, no meta-commentary about the model.
 *  - No negation copy. Never "not", "can't", "unable", "only a", "however".
 *    Say what *is* true instead: "Camera access lives in Settings" rather than
 *    "We can't access your camera".
 *  - Uncertainty is stated positively and briefly — a confidence chip and a
 *    range, never a paragraph apologising for either.
 *  - Sentence case. One idea per line. Short enough to read one-handed.
 */

import type { Confidence, Estimate, MetricType } from '../features/capture/types';

/* ------------------------------------------------------------------ camera */

export const copy = {
  permission: {
    /** Shown before the OS prompt has ever been raised. */
    ask: {
      title: 'Point Drop at anything',
      body: 'Drop reads the water behind a bottle, a banana, a bus ticket. Turn the camera on and it starts looking.',
      action: 'Turn on the camera',
    },
    /** Shown once the OS prompt has been answered and the answer lives in Settings. */
    settings: {
      title: 'Camera access lives in Settings',
      body: 'Switch the camera on for Drop and come straight back — the frame will be waiting.',
      action: 'Open Settings',
    },
    checking: 'Waking the camera',
  },

  capture: {
    /** Standing hint under the frame while the camera is live. */
    framing: 'Fill the frame with one thing',
    shutter: 'Capture',
    shutterHint: 'Takes a photo and reads the water behind it',
    findByName: 'Find by name',
    findByNameHint: 'Search the catalogue instead of using the camera',
    barcodeReady: 'Barcode in frame',
    barcodeValue: (value: string) => `Code ${value}`,
    recognizing: 'Reading the photo',
    analyzing: 'Looking up the water',
    retake: 'Frame something else',
    /** The print of the frame that was just held. */
    snapshot: 'The photo you just took',
    /** Screen-reader announcements on state transitions. */
    announce: {
      framing: 'Camera live. Fill the frame with one thing.',
      captured: 'Frame held.',
      recognizing: 'Reading the photo.',
      analyzing: (label: string) => `Looking up the water behind ${label}.`,
      presenting: (label: string, litres: string) => `${label}. ${litres}.`,
      expanded: 'Details open.',
      unresolved: 'Frame held. Find by name is ready.',
      barcode: 'Barcode in frame.',
      plate: (count: number) => `${count} things in this frame.`,
    },
  },

  result: {
    expand: 'Show the detail',
    collapse: 'Close the detail',
    adjust: 'Adjust the amount',
    confirm: 'Add to my history',
    unit: 'litres',
    unitShort: 'L',
    /** Reads as "Metric: freshwater withdrawal" beside a proxy headline. */
    metricLine: (label: string) => `Metric: ${label}`,
    assumptionsTitle: 'What went into this',
    /** Nothing reaches history until this is pressed — stated as an invitation. */
    confirmHint: 'Adds this to your personal water record',

    /* ------------------------------------------------- the signature beat */

    /** The one line that sits beside Drop before the card opens. */
    teaser: (label: string, quantity: string) => `${label} · ${quantity}`,
    /** Spoken on the pull affordance under the teaser. */
    pull: 'Pull up for the water',
    pullHint: 'Swipe up or double tap to open the full result',
    close: 'Close the result',

    /* ------------------------------------------------------ amount editor */

    amountTitle: 'How much',
    more: 'More',
    less: 'Less',
    amountBasis: (multiple: string, basis: string) => `${multiple} · ${basis}`,
    amountDone: 'Keep this amount',

    /* ------------------------------------------------------------ detail */

    sourceTitle: 'Where the number comes from',
    source: {
      dataset: 'Dataset',
      release: 'Release',
      geography: 'Geography',
      boundary: 'Boundary',
      tables: 'Factor tables',
    },
    /** Shown for a metric that stands in for the headline one. */
    secondaryLine: (label: string, litres: string) => `${label} · ${litres}`,

    /* ----------------------------------------------------------- confirm */

    /* ------------------------------------------------- the shortlist */

    /** Sits above the alternatives when recognition offered rather than said. */
    otherMatches: 'Also looks like',
    switchTo: (label: string) => `Switch to ${label}`,

    /* ------------------------------------------------------------ the pile */

    /** The save line on a pile of cards — the count is the copy. */
    confirmMany: (count: number) => `Add ${count} to my history`,
    dismiss: 'Set this one aside',
    queue: 'Add this one',
    /** The two directions, said once, under the pile. */
    sortHint: 'Swipe right to add it, left to set it aside',
    bring: (label: string) => `Bring ${label} to the front`,
    inFrame: (count: number) =>
      count === 1 ? 'One thing in this frame' : `${count} things in this frame`,

    /* -------------------------------------------------------------- the tray */

    /** The tray by the History door, counting what a save would write. */
    tray: (count: number) => (count === 1 ? '1 to add' : `${count} to add`),
    /** Nothing swiped across is written yet, so the way out says what it costs. */
    closeWithQueue: (count: number) =>
      count === 1 ? 'Put it back and close' : `Put the ${count} back and close`,

    announce: {
      expanded: (label: string, litres: string) => `${label}. ${litres}. Details open.`,
      collapsed: 'Result closed.',
      amount: (quantity: string, litres: string) => `${quantity}. ${litres}.`,
      confirmed: (label: string) => `${label} added to your history.`,
      /** The write failed. The card stayed where it was, so say so and invite the retry. */
      saveFailed: 'That save stalled. The card is still here — press again.',
      dismissed: (label: string, left: number) => `${label} set aside. ${left} left.`,
      /** Said as a card reaches the tray. It is waiting, not written. */
      queued: (label: string, waiting: number, left: number) =>
        `${label} ready to add. ${waiting} waiting, ${left} left to sort.`,
      /** Said when the way out puts the tray back. */
      discarded: (count: number) =>
        `Result closed. ${count} went back into the photo.`,
      presentingMany: (count: number, label: string, litres: string) =>
        `${count} things in this frame. ${label}. ${litres}.`,
      confirmedMany: (count: number, label: string) =>
        `${count} things added to your history as ${label}.`,
    },
  },

  /** Several things in one photo, saved as one record. */
  plate: {
    /** The name a card wears when the model saw it but named it nothing. */
    unknownItem: 'Something new',
    /** Beside a pile item whose water figure arrives in a later release. */
    arrivingLater: 'Arriving later',
  },

  /** An item whose water figure arrives in a later release. */
  unsupported: {
    title: 'Something new',
    /** Offered instead of a number, so the moment still has a next step. */
    action: 'Find by name',
    keep: 'Frame something else',
  },

  unresolved: {
    title: 'Held for you',
    body: 'The photo is saved in this frame. Find it by name and Drop will pick the thread back up.',
    action: 'Find by name',
  },

  search: {
    title: 'Find by name',
    body: 'Type what you are holding and Drop matches it to the catalogue.',
    placeholder: 'Oat milk, banana, train ride',
    back: 'Back to the camera',

    /* ------------------------------------------------------- the field */

    fieldLabel: 'What are you holding',
    clear: 'Clear what you typed',
    opening: 'Opening the catalogue',

    /* -------------------------------------------------------- the list */

    /** Header over the standing list, before anything has been typed. */
    browse: 'Everyday things',
    matches: (count = 0) => (count === 1 ? '1 match' : `${count} matches`),
    /** Reads as "Food · one banana" under an item's name. */
    row: (category = 'Food', basis = 'one serving') => `${category} · ${basis}`,
    rowHint: 'Opens the amount for this',
    empty: 'Try another word for it.',
    emptyHint: (count = 0) => `Drop knows ${count} things by name.`,

    /* ------------------------------------------------------ the amount */

    amountBack: 'Pick something else',
    go: 'Show me the water',
    goHint: 'Hands this to Drop on the camera screen',

    /* ------------------------------------------------------- the basket */

    addAnother: 'Add another thing',
    addAnotherHint: 'Keeps this and goes back to the list',
    goMany: (count = 2) => `Show me the water · ${count}`,
    goManyHint: 'Hands everything to Drop as one plate',
    basketLabel: (count = 1) =>
      count === 1 ? 'One thing added' : `${count} things added`,
    removePick: (label = 'Apple') => `Remove ${label}`,
    removePickHint: 'Takes this thing out of the group',
    soFar: (count = 1) =>
      count === 1 ? 'One thing so far' : `${count} things so far`,

    /** The word beside an item's drawn mark. */
    category: {
      food: 'Food',
      drink: 'Drink',
      transport: 'Transport',
      product: 'Product',
    },

    announce: {
      results: (count = 0, query = '') =>
        count === 1 ? `1 match for ${query}` : `${count} matches for ${query}`,
      amount: (label = 'Apple') => `${label}. Set the amount.`,
      added: (label = 'Apple', count = 1) => `${label} added. ${count} so far.`,
      removed: (label = 'Apple') => `${label} removed.`,
    },
  },

  /* ------------------------------------------------------------- history */

  history: {
    /** The way in, from the camera. */
    open: 'History',
    openHint: 'Opens your water record',
    /** The badge and announcement when a saved card lands on the door. */
    plusOne: '+1',
    landed: 'Saved. Open History to review or remove it.',
    back: 'Back to the camera',

    title: 'Your water',
    today: 'Today',
    yesterday: 'Yesterday',
    /** The hero figure, spoken as one phrase. */
    todayLine: (litres = '0 litres') => `Today, ${litres}`,

    /* ------------------------------------------------------------ chart */

    range: { week: '7 days', month: '30 days' },
    rangeHint: 'Draws the chart over this many days',
    spanWeek: 'Last 7 days',
    spanMonth: 'Last 30 days',
    /** One bar, spoken. "Tuesday, 4,200 litres". */
    bar: (day = 'Monday', litres = '0 litres') => `${day}, ${litres}`,
    /** The three sentences under the chart, joined with a middle dot. */
    summaryTotal: (span = 'Last 7 days', litres = '0 litres') =>
      `${span}: ${litres} in total`,
    summaryDaily: (litres = '0 litres') => `${litres} a day on average`,
    summaryPeak: (day = 'Monday', litres = '0 litres') =>
      `${day} ran highest at ${litres}`,
    /** Shown while every day in the window is still open. */
    summaryQuiet: (span = 'Last 7 days') => `${span}: a clean page so far`,

    /* ------------------------------------------------------------- rows */

    entryHint: 'Opens the full record',
    swipeHint: 'Swipe left to take it out',
    removeAction: 'Take out',
    removeHint: 'Takes this out of your history',
    removed: (label = 'Apple') => `${label} is out of your history`,
    restore: 'Put it back',
    restoreHint: 'Puts this back in your history',
    /** Joins the facts of one row into a single spoken sentence. */
    line: (...parts: string[]) => parts.filter(Boolean).join('. '),

    /* ------------------------------------------------------------ empty */

    empty: {
      title: 'A clean page',
      body: 'Your first drop starts at the camera.',
      action: 'Open the camera',
    },

    /* ----------------------------------------------------------- detail */

    detail: {
      title: 'The record',
      recorded: (when = 'Today at 09:12') => `Recorded ${when}`,
      photo: 'The photo behind this record',
      amount: 'Amount',
      onThePlate: 'On the plate',
      remove: 'Take this out of history',
      /** The footer under the source block. */
      frozen: 'Saved exactly as it read on the day',
      factors: (version = '2026.08.2') => `Factor tables ${version}`,
      missing: 'This record lives on another page now',
    },

    /* ------------------------------------------------------ announcements */

    announce: {
      opened: (litres = '0 litres') => `History. Today, ${litres}.`,
      range: (span = 'Last 7 days') => `Chart showing ${span}.`,
      removed: (label = 'Apple', litres = '0 litres') =>
        `${label} is out of your history. Today reads ${litres}.`,
      restored: (label = 'Apple', litres = '0 litres') =>
        `${label} is back in your history. Today reads ${litres}.`,
    },

    /** Developer route only. */
    seed: 'Fill 40 days with sample entries',
    seeding: 'Filling 40 days',
  },

  /* -------------------------------------------------------------- goal */

  /**
   * The mark for the week.
   *
   * Two things this copy holds to. It never grades a week — a person who logs
   * an honest heavy week has done the thing the product asks of them, and being
   * told off for it teaches them to stop logging. And it states figures rather
   * than verdicts: "1,100 L over" is a fact the person can act on, where "over
   * your goal" is a scolding with the useful part left out.
   */
  goal: {
    span: 'This week',
    /** The figures over the bar: "7,200 of 14,000 L". */
    count: (spent = '0', goal = '0') => `${spent} of ${goal}`,
    /** Sits under the bar on the left. */
    daysLeft: (days = 0) =>
      days === 0 ? 'Last day of the week' : days === 1 ? '1 day left' : `${days} days left`,
    /** Under the bar on the right, once the week is near the mark or past it. */
    toMark: (litres = '0 L') => `${litres} to the mark`,
    over: (litres = '0 L') => `${litres} over`,
    /** Opens the sheet from the record. */
    edit: 'Move the mark',
    editHint: 'Opens the weekly mark',

    /** The whole bar, spoken as one phrase. */
    spoken: (spent = '0 litres', goal = '0 litres', days = 'Last day of the week') =>
      `This week, ${spent} of a ${goal} mark. ${days}.`,
    /** Where the week ought to stand today, spoken after the figures. */
    paceSpoken: (litres = '0 litres') => `Today's share of the mark is ${litres}`,

    /* ------------------------------------------- before there is a mark */

    invite: {
      title: 'Give the week a mark',
      body: 'A weekly number to measure against, moved whenever you like.',
      action: 'Set a mark',
    },

    /* -------------------------------------------------- the heavy thing */

    /**
     * Names the week's heaviest item and, where the catalogue holds a lighter
     * one of the same kind, what that swap frees. Both figures come from the
     * same tables as every other number in Drop.
     */
    leader: (label = 'Beef', times = 1, litres = '0 L') =>
      times > 1 ? `${label}, ${times}× — ${litres} of this week` : `${label} — ${litres} of this week`,
    swap: (label = 'Chicken', litres = '0 L') => `${label} instead frees ${litres}`,
    swapHint: 'Opens this item in the catalogue',

    /* ------------------------------------------------------- the sheet */

    sheet: {
      title: 'A mark for the week',
      body: 'Drop counts what you confirm. Move the mark whenever you like.',
      close: 'Close',
      perDay: (litres = '0 L') => `${litres} a day`,
      less: 'Less',
      more: 'More',
      lessHint: 'Lowers the mark by 500 litres',
      moreHint: 'Raises the mark by 500 litres',
      save: 'Set the mark',
      saved: 'The mark is set',
      remove: 'Take the mark off',
      removeHint: 'Removes the weekly mark from your record',
      /** Spoken when the stepper moves. */
      announce: (litres = '0 litres') => `${litres} a week`,
    },

    /* ------------------------------------------------------- the marks */

    /** Built from the person's own weeks, once there are two of them. */
    fromBaseline: {
      title: 'Your last weeks ran',
      tenth: 'A tenth under your average',
      tenthBody: 'A week that moves without being felt',
      quarter: 'A quarter under',
      quarterBody: 'A steeper week — one swap most days',
      hold: 'Hold your average',
      holdBody: 'Watch the shape before moving it',
    },

    /**
     * Day one has no average, and there is no per-person water figure that
     * plays the part maintenance calories play in a calorie tracker. So the
     * opening mark says what it is: a round number to measure a first week
     * against, with a way to wait for a real one.
     */
    opening: {
      start: 'Start here',
      startBody: 'A round number to measure your first week against',
      light: 'Lighter',
      lightBody: 'Mostly plants, short trips',
      later: 'Decide later',
      laterBody: 'Log a week and Drop will suggest a number from it',
      note: 'Drop suggests a mark of your own once two weeks are logged',
    },
  },

  /* --------------------------------------------------------- first run */

  /**
   * Two screens, both in Drop's own voice. The first makes the promise, the
   * second asks for the camera as the character asking to see. Either one can
   * be left at any moment — the way out is on screen the whole time.
   */
  onboarding: {
    skip: 'Skip',
    skipHint: 'Goes straight to the camera',
    /** Printed beside the drawn dashes. */
    stepShort: (current = '1', total = '3') => `${current} of ${total}`,
    /** What a screen reader hears in that dash's place. */
    step: (current = '1', total = '3') => `Step ${current} of ${total}`,

    promise: {
      title: 'Every thing you use carries hidden water.',
      body: "Let's see it.",
      action: 'Show me',
      actionHint: 'Goes to the next screen',
    },

    /**
     * The weekly mark, offered before there is a week to build one from.
     *
     * The copy owns that plainly — "somewhere to start" — because on day one
     * the number really is a round one, and dressing it up as a recommendation
     * would be the false precision the whole product exists to avoid. Both
     * offered marks are round, the way out is beside them, and Drop says it
     * will bring a real number once it has the weeks to make one from.
     */
    mark: {
      title: 'Give the week a mark.',
      body: 'A weekly number to measure against. Pick somewhere to start — you can move it whenever you like.',
      action: 'Use this mark',
      actionHint: 'Saves this weekly mark and goes to the next screen',
      later: 'Decide later',
      laterHint: 'Goes to the next screen without a mark',
      /** The two round marks, named so a choice is between words. */
      steady: 'Steady',
      steadyBody: 'An everyday week, meat a few times',
      lighter: 'Lighter',
      lighterBody: 'Mostly plants, short trips',
      /** Sits under the choices. */
      note: 'Drop brings you a mark of your own once two weeks are logged.',
      /** Spoken for one choice. */
      choice: (name = 'Steady', litres = '0 litres') => `${name}, ${litres} a week`,
    },

    camera: {
      title: 'Let me look through your camera.',
      body: 'Hold me up to a bottle, a banana, a bus ticket. I read the water behind it and hand you the number.',
      action: 'Turn on the camera',
      actionHint: 'Asks your phone for camera access',
      later: 'Later',
      laterHint: 'Goes to the camera and asks there instead',
    },

    announce: {
      promise: 'Welcome to Drop. Every thing you use carries hidden water.',
      mark: 'Choose a weekly mark, or decide later.',
      camera: 'Drop is asking to look through your camera.',
      done: 'Camera ready.',
      /** Spoken once a mark is taken. */
      marked: (litres = '0 litres') => `Mark set to ${litres} a week.`,
    },
  },

  /* ---------------------------------------------------------- settings */

  settings: {
    /** The way in, from the camera. */
    open: 'Settings',
    openHint: 'Opens how Drop looks and where its numbers come from',
    title: 'Settings',
    done: 'Done',
    doneHint: 'Closes settings',

    appearance: {
      title: 'Appearance',
      theme: 'Theme',
      themeHint: 'Chooses the palette Drop draws with',
      system: 'System',
      light: 'Light',
      dark: 'Dark',
    },

    reading: {
      title: 'Reading',
      clearerText: 'Clearer text',
      clearerTextBody: 'Swaps the handwriting for your phone’s own font at a heavier weight.',
      reduceTexture: 'Reduce texture',
      reduceTextureBody: 'Puts the paper grain away and leaves a flat ground.',
      reduceMotion: 'Reduce motion',
      reduceMotionBody: 'Lands every change straight on its end state.',
    },

    about: {
      title: 'Where the numbers come from',
      body: 'Every litre traces to a published dataset. These are the releases inside this build.',
      tables: (version = '2026.08.2') => `Factor tables ${version}`,
      catalog: (count = '1000') => `${count} things Drop knows by name`,
      /** Reads as "Release · v1.0 (2025-05-01)" under a dataset name. */
      release: (value = 'v1.0') => `Release · ${value}`,
      rights: (value = 'CC BY 4.0') => `Rights · ${value}`,
      /** Used where a table publishes its provenance in place of a rights line. */
      source: (value = 'Wu et al. (2009)') => `Source · ${value}`,
    },

    update: {
      checking: 'Looking for a newer release',
      current: 'This build carries the newest release.',
      ready: (version = '2026.09.1') => `Release ${version} is ready`,
      /** The one thing a person needs to know about what an update touches. */
      body: 'Your history keeps the figures it was recorded with. New captures use the new release.',
    },

    /**
     * The switches and the theme chips carry real platform roles and states, so
     * a screen reader speaks their changes itself. Only arriving needs saying.
     */
    announce: { opened: 'Settings.' },
  },
} as const;

/* ------------------------------------------------------- estimate wording */

/**
 * Confidence, said out loud. Four words, each one a claim about the *match* —
 * never about the data being wrong.
 */
const CONFIDENCE_WORD: Record<Confidence, string> = {
  high: 'solid match',
  medium: 'close match',
  low: 'rough estimate',
  very_low: 'ballpark',
};

export function confidenceChip(confidence: Confidence | null): string {
  return confidence ? CONFIDENCE_WORD[confidence] : CONFIDENCE_WORD.very_low;
}

const METRIC_WORD: Record<MetricType, string> = {
  total_water_footprint: 'total water footprint',
  freshwater_withdrawal: 'freshwater withdrawal',
  freshwater_consumption: 'freshwater consumption',
  scarcity_weighted_water_use: 'scarcity-weighted water use',
};

export function metricLabel(metric: MetricType): string {
  return METRIC_WORD[metric];
}

/** Group digits without pulling in Intl formatting differences across engines. */
export function formatLitres(value: number): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const [whole, fraction] = String(rounded).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** "550–800 L", en dash, one unit at the end. */
export function formatRange(range: [number, number]): string {
  return `${formatLitres(range[0])}–${formatLitres(range[1])} ${copy.result.unitShort}`;
}

/**
 * True when a range says something the point value does not.
 *
 * Some factors publish a single figure with the low and high set to it, and a
 * few more collapse once rounded. "285–285 L" is noise beside "285 litres", so
 * the range is shown only when its ends differ at the precision Drop prints.
 */
export function hasSpread(range: [number, number] | null): range is [number, number] {
  if (!range) return false;
  return formatLitres(range[0]) !== formatLitres(range[1]);
}

/** The one line a screen reader hears for a headline number. */
export function litresSentence(estimate: Estimate): string {
  const headline = estimate.headline;
  if (!headline) return unsupportedLine(estimate);
  const base = `${formatLitres(headline.value_l)} ${copy.result.unit}`;
  return hasSpread(headline.range_l)
    ? `${base}, ranging ${formatRange(headline.range_l)}`
    : base;
}

/* --------------------------------------------------------- the hero figure */

/**
 * A range this wide says more than its midpoint does, so the range itself
 * becomes the headline. Below it, the point value is the honest single number.
 */
export const RANGE_HERO_RATIO = 1.25;

export type HeroFigure = { value: string; unit: string; range: boolean };

/**
 * The hero, decided once. Either the point value with "litres", or the range
 * with "L" — never both, and never a number that arrives by counting up.
 */
export function heroFigure(estimate: Estimate): HeroFigure | null {
  const headline = estimate.headline;
  if (!headline) return null;

  const range = headline.range_l;
  if (hasSpread(range) && range[0] > 0 && range[1] / range[0] > RANGE_HERO_RATIO) {
    return {
      value: `${formatLitres(range[0])}–${formatLitres(range[1])}`,
      unit: copy.result.unitShort,
      range: true,
    };
  }

  return {
    value: formatLitres(headline.value_l),
    unit: copy.result.unit,
    range: false,
  };
}

/* ------------------------------------------------------------- quantities */

type Unit = Estimate['quantity']['unit'];

function trim(value: number, places: number): string {
  const factor = 10 ** places;
  return String(Math.round(value * factor) / factor);
}

/** "120 g", "250 ml", "10 km", "$18", "×3". One unit, no parentheses. */
export function formatQuantity(value: number, unit: Unit): string {
  switch (unit) {
    case 'kg':
      return value < 1 ? `${Math.round(value * 1000)} g` : `${trim(value, 2)} kg`;
    case 'g':
      return value >= 1000 ? `${trim(value / 1000, 2)} kg` : `${trim(value, 0)} g`;
    case 'l':
      return value < 1 ? `${Math.round(value * 1000)} ml` : `${trim(value, 2)} L`;
    case 'ml':
      return value >= 1000 ? `${trim(value / 1000, 2)} L` : `${trim(value, 0)} ml`;
    case 'km':
      return `${trim(value, 1)} km`;
    case 'usd':
      return `$${trim(value, 2)}`;
    case 'item':
      return `×${trim(value, 0)}`;
  }
}

/** "×2" — the serving multiple beside the amount. */
export function formatMultiple(multiple: number): string {
  return `×${trim(multiple, 2)}`;
}

/* ------------------------------------------------------------ the voice */

/**
 * The words Drop keeps out of its mouth.
 *
 * Engine assumptions are written for a data reviewer, and a handful of them
 * carry the shapes this product states positively instead. Anything matching
 * this and lacking a rewrite below is left off the card rather than reworded
 * on the fly.
 */
export const NEGATION_PATTERN =
  /\bnot\b|cannot|can['’]t|won['’]t|isn['’]t|don['’]t|doesn['’]t|unable|\bonly an?\b|however|disclaimer/i;

export function hasNegationVoice(line: string): boolean {
  return NEGATION_PATTERN.test(line);
}

/* --------------------------------------------------------- assumptions */

/**
 * Engine assumptions, said in Drop's voice.
 *
 * Most lines already read well and pass through untouched. These four are
 * rewritten to state what *is* the case, and the two provenance notes meant
 * for the audit trail are dropped — the source block below the assumptions is
 * where that belongs.
 */
const ASSUMPTION_REWRITES: { match: RegExp; to: string | null }[] = [
  {
    match: /sector average carries no published spread/i,
    to: 'A sector average is published as one figure, so the number stands alone.',
  },
  {
    match: /group holds one published value, so no range/i,
    to: 'The group holds one published value, so the number stands alone.',
  },
  {
    match: /vehicle manufacture, maintenance, and road/i,
    to: 'Scope is the fuel cycle; building the vehicle and the road sits outside it.',
  },
  // Metric wording already has its own line on the card.
  { match: /^freshwater consumption, not withdrawal/i, to: null },
  // Audit-trail notes. The source block carries the provenance instead.
  { match: /technosphere exchange/i, to: null },
  { match: /occupancy already embedded/i, to: null },
];

/** How many assumption lines a card shows before it stops being a card. */
export const MAX_ASSUMPTIONS = 4;

/**
 * Short, positive lines about what went into the number.
 *
 * Order is the engine's — most specific first — and the list is capped so the
 * detail section stays readable on a phone.
 */
export function assumptionLines(estimate: Estimate): string[] {
  const lines: string[] = [];

  for (const raw of estimate.assumptions) {
    const rule = ASSUMPTION_REWRITES.find((entry) => entry.match.test(raw));
    const line = rule ? rule.to : raw;
    if (!line) continue;
    if (hasNegationVoice(line)) continue;
    if (lines.includes(line)) continue;
    lines.push(line);
    if (lines.length === MAX_ASSUMPTIONS) break;
  }

  return lines;
}

/* ------------------------------------------------------------ fallbacks */

/** How the match was reached, in four or five words. */
const FALLBACK_WORD: Record<string, string> = {
  single_source: 'Matched to a single published study',
  category_match: 'Matched by food category',
  stat_flags: 'Matched with the published spread carried through',
  spend_proxy: 'Matched by what the sector spends',
  dataset_recommends_typology: 'Matched to the group figure the dataset recommends',
  high_item_uncertainty_typology: 'Matched to the group median',
  recipe_sum: 'Matched ingredient by ingredient',
  plate_sum: 'Added up from the things in one photo',
};

/** A line for the match route, or nothing when the route needs no comment. */
export function fallbackLine(reason: string | null): string | null {
  if (!reason) return null;
  return FALLBACK_WORD[reason] ?? null;
}

/* ---------------------------------------------------------- unsupported */

/**
 * What Drop says when a figure for this item arrives in a later release.
 *
 * Every line names what is coming and offers the next move, so the moment
 * lands as an invitation rather than a wall.
 */
const UNSUPPORTED_BY_ID: Record<string, string> = {
  transport_ev_car:
    'Grid water data arrives in a future update. Track the trip distance meanwhile?',
  transport_air_long:
    'Flight water data arrives in a future update. Track the trip distance meanwhile?',
  transport_air_short:
    'Flight water data arrives in a future update. Track the trip distance meanwhile?',
  transport_rail:
    'Rail water data arrives in a future update. Track the trip distance meanwhile?',
  transport_air_freight_tkm:
    'Freight rides on tonne-kilometres. Personal tracking arrives in a future update.',
  transport_rail_freight_tkm:
    'Freight rides on tonne-kilometres. Personal tracking arrives in a future update.',
  transport_truck_tkm:
    'Freight rides on tonne-kilometres. Personal tracking arrives in a future update.',
};

const UNSUPPORTED_DEFAULT =
  'Water data for this one arrives in a future update. Find something else by name?';

/** The model saw it; the catalogue has yet to learn its name. */
const UNSUPPORTED_UNMATCHED =
  'Drop is still learning this one. Find it by name?';

export function unsupportedLine(estimate: Estimate): string {
  if (estimate.unsupported?.reason === 'not_in_catalog') return UNSUPPORTED_UNMATCHED;
  return UNSUPPORTED_BY_ID[estimate.catalog_id] ?? UNSUPPORTED_DEFAULT;
}

/** Every unsupported line, for the voice test. */
export const UNSUPPORTED_LINES: string[] = [
  ...Object.values(UNSUPPORTED_BY_ID),
  UNSUPPORTED_DEFAULT,
  UNSUPPORTED_UNMATCHED,
];

/* -------------------------------------------------------------- sources */

export type SourceRow = { label: string; value: string };

/** Dataset, release, geography, boundary — the provenance, in reading order. */
export function sourceRows(estimate: Estimate): SourceRow[] {
  const factor = estimate.factor;
  const rows: SourceRow[] = [];
  if (factor) {
    rows.push({ label: copy.result.source.dataset, value: factor.dataset });
    rows.push({ label: copy.result.source.release, value: factor.dataset_release });
    rows.push({ label: copy.result.source.geography, value: factor.geography });
    if (factor.system_boundary) {
      rows.push({ label: copy.result.source.boundary, value: factor.system_boundary });
    }
  }
  rows.push({ label: copy.result.source.tables, value: estimate.factors_version });
  return rows;
}
