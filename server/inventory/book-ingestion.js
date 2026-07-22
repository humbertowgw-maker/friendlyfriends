/**
 * Book/Script ingestion service.
 * Takes raw script text, extracts character mentions and implied actions,
 * diffs against the inventory, and creates InventoryGap records.
 */

const ACTION_KEYWORDS = [
  'waving', 'wave', 'wags', 'wag', 'tail', 'sitting', 'sit', 'standing', 'stand',
  'walking', 'walk', 'running', 'run', 'jumping', 'jump', 'sleeping', 'sleep',
  'eating', 'eat', 'drinking', 'drink', 'playing', 'play', 'barking', 'bark',
  'meowing', 'meow', 'chirping', 'chirp', 'singing', 'sing', 'flying', 'fly',
  'crawling', 'crawl', 'sneaking', 'sneak', 'hiding', 'hide', 'looking', 'look',
  'tilting', 'tilt', 'tilts', 'sniffing', 'sniff', 'licking', 'lick',
  'stretching', 'stretch', 'purring', 'purr', 'fluttering', 'flutter',
  'hop hopping', 'hop', 'hops', 'perching', 'perch',
  'happy', 'sad', 'excited', 'scared', 'angry', 'curious', 'surprised',
  'wagging', 'panting', 'whining', 'howling', 'growling',
  'nuzzling', 'nuzzle', 'cuddling', 'cuddle', 'following', 'follow',
  'fetching', 'fetch', 'rolling', 'roll', 'spinning', 'spin',
  'climbing', 'climb', 'digging', 'dig', 'swimming', 'swim',
];

const POSE_KEYWORDS = [
  'pose', 'portrait', 'close-up', 'close up', 'profile', 'sitting', 'standing',
  'lying', 'lying down', 'head tilt', 'head_tilt', 'front', 'side', 'back',
];

const EXPRESSION_KEYWORDS = [
  'happy', 'sad', 'excited', 'scared', 'angry', 'curious', 'surprised',
  'sleepy', 'confused', 'proud', 'worried', 'content', 'playful',
];

const MOVEMENT_KEYWORDS = [
  'walking', 'walk', 'running', 'run', 'trotting', 'trot', 'galloping', 'gallop',
  'jumping', 'jump', 'climbing', 'climb', 'flying', 'fly', 'hopping', 'hop',
  'crawling', 'crawl', 'swimming', 'swim', 'spinning', 'spin', 'rolling', 'roll',
  'fluttering', 'flutter', 'swooping', 'swoop',
];

export class BookIngestion {
  constructor(db, inventory) {
    this.db = db;
    this.inventory = inventory;
  }

  /**
   * Detect which known characters are mentioned in a text string.
   * Returns array of { id, name, slug } for matched characters.
   */
  detectCharacters(text) {
    const characters = this.inventory.getAllCharacters();
    const lowerText = text.toLowerCase();
    const matches = [];
    for (const char of characters) {
      if (lowerText.includes(char.name.toLowerCase()) || lowerText.includes(char.slug)) {
        matches.push({ id: char.id, name: char.name, slug: char.slug });
      }
    }
    return matches;
  }

  /**
   * Extract implied actions from text. Uses simple keyword matching.
   * Returns array of { label, type } objects.
   * Note: a more robust NLP/LLM step could replace this in the future.
   */
  extractActions(text) {
    const lowerText = text.toLowerCase();
    const actions = [];
    const seen = new Set();

    const addIfPresent = (keywords, type) => {
      for (const kw of keywords) {
        if (lowerText.includes(kw)) {
          const label = kw.replace(/\s+/g, '_');
          const key = `${type}:${label}`;
          if (!seen.has(key)) {
            seen.add(key);
            actions.push({ label, type });
          }
        }
      }
    };

    addIfPresent(MOVEMENT_KEYWORDS, 'movement_cycle');
    addIfPresent(EXPRESSION_KEYWORDS, 'expression');
    addIfPresent(ACTION_KEYWORDS, 'pose');

    return actions;
  }

  /**
   * Classify an action label into an asset type.
   */
  classifyAction(label) {
    const lower = label.toLowerCase();
    if (MOVEMENT_KEYWORDS.includes(lower)) return 'movement_cycle';
    if (EXPRESSION_KEYWORDS.includes(lower)) return 'expression';
    return 'pose';
  }

  /**
   * Ingest a single script/page/chunk.
   * @param {object} chunk - { source_id, source_type, page_or_episode, content_text }
   * @param {object} options - { autoGenerate: false }
   * @returns { object } - { bookReference, detectedCharacters, gaps, generated }
   */
  async ingestChunk(chunk, { autoGenerate = false, generateFn = null } = {}) {
    const { source_id, source_type = 'script', page_or_episode, content_text } = chunk;

    // Detect characters
    const detectedChars = this.detectCharacters(content_text);
    const characterIds = detectedChars.map(c => c.id);

    // Extract actions and pair them with detected characters
    const rawActions = this.extractActions(content_text);
    const actions = [];
    const gaps = [];
    const generated = [];

    // For each detected character, associate all extracted actions
    for (const charId of characterIds) {
      for (const action of rawActions) {
        actions.push({ character_id: charId, action_label: action.label });

        // Check if this asset already exists
        const existing = this.inventory.lookupAsset(charId, action.label, action.type);
        if (!existing) {
          // Create gap
          const ref = this.inventory.upsertBookReference({
            source_id,
            source_type,
            page_or_episode,
            content_text,
            character_ids: characterIds,
            actions,
          });

          const gap = this.inventory.createGap(charId, action.label, action.type, ref.id);
          gaps.push(gap);

          // Auto-generate if configured
          if (autoGenerate && generateFn) {
            const asset = await generateFn(charId, action.label, action.type);
            if (asset) {
              this.inventory.createAsset(charId, {
                type: action.type,
                label: action.label,
                asset_ref: asset.asset_ref,
                metadata: asset.metadata || {},
                source: 'generated',
              });
              this.inventory.resolveGap(gap.id);
              generated.push({ character_id: charId, label: action.label, type: action.type });
            }
          }
        }
      }
    }

    // Upsert the book reference
    const bookRef = this.inventory.upsertBookReference({
      source_id,
      source_type,
      page_or_episode,
      content_text,
      character_ids: characterIds,
      actions,
    });

    // Mark resolved if no gaps
    if (gaps.length === 0) {
      this.inventory.markBookReferenceResolved(bookRef.id, true);
    }

    return {
      bookReference: bookRef,
      detectedCharacters: detectedChars,
      detectedActions: rawActions,
      gaps,
      generated,
    };
  }

  /**
   * Ingest multiple chunks at once.
   */
  async ingestBatch(chunks, options = {}) {
    const results = [];
    for (const chunk of chunks) {
      const result = await this.ingestChunk(chunk, options);
      results.push(result);
    }
    return results;
  }
}
