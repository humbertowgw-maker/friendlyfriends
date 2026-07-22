/**
 * Builds character-consistent prompts for image generation.
 * Ensures the same character description is used across all generations
 * for visual consistency.
 */

const CHARACTER_PROMPTS = {
  achilles: {
    short: 'a tan medium-sized dog, half Australian Shepherd half Husky, blind service dog, warm gentle expression',
    full: 'a friendly tan-colored medium-sized dog (~60 lbs), half Australian Shepherd and half Husky breed mix, blind with calm gentle eyes, wearing a service dog vest, warm and loyal expression',
  },
  athena: {
    short: 'a tan and beige dog, Achilles sister, sweet face, slightly round',
    full: 'a sweet tan and beige colored female dog, sister to Achilles, slightly round build, gentle warm eyes, friendly expression',
  },
  henry: {
    short: 'an all-white cat, deaf, large expressive eyes, elegant',
    full: 'an elegant all-white cat, deaf with large very expressive eyes, pristine white fur, curious and attentive posture',
  },
  falcor: {
    short: 'an all-white short-haired cat, cross-eyed blue eyes, oldest of the group',
    full: 'an all-white short-haired cat, the eldest of the group, distinctive cross-eyed bright blue eyes, wise and dignified expression',
  },
  peter: {
    short: 'a colorful parakeet, bright green and yellow feathers, vocal and happy',
    full: 'a bright colorful parakeet bird, vibrant green and yellow feathers, small and energetic, beak open as if singing, cheerful expression',
  },
  walter: {
    short: 'a small blue lovebird, bright blue plumage, Peter cage-mate',
    full: 'a small blue lovebird parrot, bright vivid blue plumage, tiny and adorable, companion to Peter the parakeet, curious expression',
  },
};

const ACTION_POSES = {
  sitting: 'sitting calmly, relaxed posture',
  walking: 'walking forward, mid-stride, dynamic pose',
  running: 'running fast, motion blur on legs, energetic',
  jumping: 'jumping in the air, playful, all four paws off ground',
  sleeping: 'sleeping peacefully, curled up, eyes closed',
  eating: 'eating from a bowl, head down, content',
  singing: 'singing with beak open, musical notes floating, joyful',
  waving: 'waving with one paw raised, friendly greeting pose',
  looking: 'looking up with curious expression, head tilted',
  flying: 'flying with wings spread wide, graceful in the air',
  fluttering: 'fluttering wings rapidly, hovering in place, playful',
  happy: 'very happy expression, tail wagging or purring, bright eyes',
  sad: 'sad expression, ears down or eyes droopy, melancholy',
  excited: 'excited expression, bouncing or wiggling, wide eyes',
  curious: 'curious expression, head tilted to the side, investigating',
  scared: 'scared expression, cowering slightly, wide eyes, ears back',
  angry: 'angry expression, hissing or growling, defensive posture',
  surprised: 'surprised expression, wide eyes, mouth open',
};

export class PromptBuilder {
  static getCharacterDescription(slug) {
    return CHARACTER_PROMPTS[slug]?.full || CHARACTER_PROMPTS[slug]?.short || slug;
  }

  static getCharacterShort(slug) {
    return CHARACTER_PROMPTS[slug]?.short || slug;
  }

  static buildPosePrompt(slug, actionLabel) {
    const char = this.getCharacterDescription(slug);
    const action = ACTION_POSES[actionLabel] || actionLabel.replace(/_/g, ' ');
    const style = 'cartoon style, children book illustration, colorful, cute, friendly, 2D animation, clean bold lines, vibrant colors';
    return `${char}, ${action}, ${style}, high quality, detailed`;
  }

  static buildExpressionPrompt(slug, expression) {
    const char = this.getCharacterDescription(slug);
    const expr = ACTION_POSES[expression] || `${expression} facial expression`;
    const style = 'cartoon style, children book illustration, expressive face, close-up portrait, colorful, cute, 2D animation';
    return `${char}, ${expr}, ${style}, high quality, detailed`;
  }

  static buildMovementPrompt(slug, movement) {
    const char = this.getCharacterDescription(slug);
    const move = ACTION_POSES[movement] || `${movement} animation frame`;
    const style = 'cartoon style, children book illustration, side view, animation sprite sheet frame, clean lines, dynamic pose';
    return `${char}, ${move}, ${style}, high quality, detailed`;
  }

  static build(slug, actionLabel, assetType) {
    switch (assetType) {
      case 'expression': return this.buildExpressionPrompt(slug, actionLabel);
      case 'movement_cycle': return this.buildMovementPrompt(slug, actionLabel);
      case 'voice_line': return null; // No image for voice
      default: return this.buildPosePrompt(slug, actionLabel);
    }
  }

  static getCharacterSlugs() {
    return Object.keys(CHARACTER_PROMPTS);
  }

  static registerCharacter(slug, description) {
    CHARACTER_PROMPTS[slug] = {
      short: description,
      full: description,
    };
  }
}
