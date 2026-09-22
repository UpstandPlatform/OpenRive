// Example .riv files shipped in /public/examples (from rive-runtime's MIT-licensed test assets).
export interface Example {
  id: string;
  name: string;
  description: string;
  learn: string[];
  /** path under /public */
  file: string;
  /** artboard to preview */
  artboard?: string;
  /** preview without a state machine by mixing every timeline */
  mixAll?: boolean;
}

export const EXAMPLES: Example[] = [
  {
    id: 'off-road-car',
    name: 'Off-road Car',
    description: 'A bouncing jeep with spinning wheels and wipers: several looping timelines playing together.',
    learn: ['Layered timelines', 'Gradients', 'Complex vector art'],
    file: '/examples/off_road_car.riv',
    artboard: 'New Artboard',
    mixAll: true,
  },
  {
    id: 'death-knight',
    name: 'Death Knight',
    description: 'A game character with bones, nested artboards and a 4-layer state machine (walk, attack, facing, death).',
    learn: ['Bones and skinning', 'Nested artboards', 'Game-style state machines'],
    file: '/examples/death_knight.riv',
    artboard: 'MC Main Artboard',
  },
];

export const getExample = (id: string) => EXAMPLES.find((e) => e.id === id);
