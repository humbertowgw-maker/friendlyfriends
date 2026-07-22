/**
 * Pre-built scene templates for common cartoon scenes.
 * Each template includes narration, actions, dialogue, and background.
 */

export const SCENE_TEMPLATES = [
  {
    id: 'morning_walk',
    name: 'Morning Walk',
    category: 'daily',
    background_scene: 'garden',
    narration: 'Every morning, the pets go for a walk in the garden. The sun is warm and the flowers smell wonderful.',
    actions: [
      { character_slug: 'achilles', action_label: 'walking' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'Every morning, the pets go for a walk in the garden.' },
      { character_slug: 'achilles', text: 'I love the smell of these flowers!' },
    ],
  },
  {
    id: 'feeding_time',
    name: 'Feeding Time',
    category: 'daily',
    background_scene: 'kitchen',
    narration: 'It is feeding time! The pets gather in the kitchen, waiting for their food bowls.',
    actions: [
      { character_slug: 'achilles', action_label: 'eating' },
      { character_slug: 'athena', action_label: 'eating' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'It is feeding time! The pets gather in the kitchen.' },
      { character_slug: 'athena', text: 'Yummy! I love dinner time!' },
    ],
  },
  {
    id: 'playtime',
    name: 'Playtime',
    category: 'fun',
    background_scene: 'backyard',
    narration: 'The pets play together in the backyard. They chase each other and have so much fun!',
    actions: [
      { character_slug: 'achilles', action_label: 'running' },
      { character_slug: 'athena', action_label: 'jumping' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'The pets play together in the backyard.' },
      { character_slug: 'achilles', text: 'Catch me if you can!' },
    ],
  },
  {
    id: 'bedtime_story',
    name: 'Bedtime Story',
    category: 'daily',
    background_scene: 'bedroom',
    narration: 'As the sun sets, the pets gather in the bedroom for a cozy bedtime story.',
    actions: [
      { character_slug: 'henry', action_label: 'sleeping' },
      { character_slug: 'falcor', action_label: 'sleeping' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'As the sun sets, the pets gather for a cozy bedtime story.' },
    ],
  },
  {
    id: 'park_adventure',
    name: 'Park Adventure',
    category: 'adventure',
    background_scene: 'park',
    narration: 'Today the pets go on an adventure to the park. There is so much to see and do!',
    actions: [
      { character_slug: 'achilles', action_label: 'walking' },
      { character_slug: 'peter', action_label: 'flying' },
      { character_slug: 'walter', action_label: 'fluttering' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'Today the pets go on an adventure to the park.' },
      { character_slug: 'peter', text: 'Look at all the trees!' },
      { character_slug: 'walter', text: 'Tweet tweet!' },
    ],
  },
  {
    id: 'rainy_day',
    name: 'Rainy Day',
    category: 'daily',
    background_scene: 'indoor_general',
    narration: 'It is raining outside. The pets stay inside and play games together.',
    actions: [
      { character_slug: 'achilles', action_label: 'sitting' },
      { character_slug: 'henry', action_label: 'looking' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'It is raining outside. The pets stay inside.' },
      { character_slug: 'henry', text: 'I do not like the rain. Let us play inside!' },
    ],
  },
  {
    id: 'beach_day',
    name: 'Beach Day',
    category: 'adventure',
    background_scene: 'beach',
    narration: 'The pets visit the beach for the first time. The waves are big and the sand is warm.',
    actions: [
      { character_slug: 'achilles', action_label: 'sitting' },
      { character_slug: 'athena', action_label: 'excited' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'The pets visit the beach for the first time.' },
      { character_slug: 'athena', text: 'The water is so cool!' },
    ],
  },
  {
    id: 'garden_party',
    name: 'Garden Party',
    category: 'fun',
    background_scene: 'garden',
    narration: 'All the friends gather in the garden for a special party with treats and music.',
    actions: [
      { character_slug: 'achilles', action_label: 'happy' },
      { character_slug: 'athena', action_label: 'happy' },
      { character_slug: 'peter', action_label: 'singing' },
      { character_slug: 'walter', action_label: 'singing' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'All the friends gather in the garden for a special party.' },
      { character_slug: 'peter', text: 'This is the best party ever!' },
      { character_slug: 'walter', text: 'I love parties!' },
    ],
  },
  {
    id: 'scary_noise',
    name: 'Scary Noise',
    category: 'emotion',
    background_scene: 'nighttime',
    narration: 'Late at night, the pets hear a strange noise. They huddle together, a little scared.',
    actions: [
      { character_slug: 'henry', action_label: 'scared' },
      { character_slug: 'athena', action_label: 'scared' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'Late at night, the pets hear a strange noise.' },
      { character_slug: 'henry', text: 'What was that? I am scared!' },
      { character_slug: 'achilles', text: 'Do not worry. I am here to protect you.' },
    ],
  },
  {
    id: 'discovery',
    name: 'Discovery',
    category: 'adventure',
    background_scene: 'forest',
    narration: 'The pets find a mysterious path in the forest. They follow it to see where it leads.',
    actions: [
      { character_slug: 'achilles', action_label: 'curious' },
      { character_slug: 'henry', action_label: 'curious' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'The pets find a mysterious path in the forest.' },
      { character_slug: 'achilles', text: 'I wonder where this path goes?' },
      { character_slug: 'henry', text: 'Let us find out together!' },
    ],
  },
  {
    id: 'singing_lesson',
    name: 'Singing Lesson',
    category: 'fun',
    background_scene: 'living_room',
    narration: 'Peter teaches Walter how to sing a new song. They practice together in the living room.',
    actions: [
      { character_slug: 'peter', action_label: 'singing' },
      { character_slug: 'walter', action_label: 'singing' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'Peter teaches Walter how to sing a new song.' },
      { character_slug: 'peter', text: 'Just follow my lead! Tweet tweet!' },
      { character_slug: 'walter', text: 'Tweet... tweet? Is that right?' },
    ],
  },
  {
    id: 'friend_in_need',
    name: 'Friend in Need',
    category: 'emotion',
    background_scene: 'park',
    narration: 'Achilles notices Athena is feeling sad. He goes to comfort her with a warm nuzzle.',
    actions: [
      { character_slug: 'athena', action_label: 'sad' },
      { character_slug: 'achilles', action_label: 'looking' },
    ],
    dialogue: [
      { character_slug: 'narrator', text: 'Achilles notices Athena is feeling sad.' },
      { character_slug: 'achilles', text: 'What is wrong, sister? I am here for you.' },
      { character_slug: 'athena', text: 'Thank you, Achilles. You always know how to help.' },
    ],
  },
];

export const TEMPLATE_CATEGORIES = {
  daily: { name: 'Daily Life', color: '#60a5fa' },
  fun: { name: 'Fun & Play', color: '#4ade80' },
  adventure: { name: 'Adventure', color: '#eab308' },
  emotion: { name: 'Emotions', color: '#f472b6' },
};
