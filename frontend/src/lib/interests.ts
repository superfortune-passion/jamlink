import type { Interest } from '@/types';

export const INTERESTS: Interest[] = [
  { id: 'guitarist', title: 'Guitarist', icon: '🎸', priority: true },
  { id: 'vocalist', title: 'Vocalist', icon: '🎤', priority: true },
  { id: 'producer', title: 'Producer', icon: '🎛️', priority: true },
  { id: 'songwriter', title: 'Songwriter', icon: '✍️', priority: true },
  { id: 'drummer', title: 'Drummer', icon: '🥁' },
  { id: 'bassist', title: 'Bassist', icon: '🎸' },
  { id: 'pianist', title: 'Pianist', icon: '🎹' },
  { id: 'dj', title: 'DJ', icon: '🎧' },
  { id: 'rapper', title: 'Rapper', icon: '🎤' },
  { id: 'violinist', title: 'Violinist', icon: '🎻' },
  { id: 'saxophone', title: 'Saxophone', icon: '🎷' },
  { id: 'trumpet', title: 'Trumpet', icon: '🎺' },
  { id: 'electronic', title: 'Electronic', icon: '⚡' },
  { id: 'jazz', title: 'Jazz', icon: '🎵' },
  { id: 'rock', title: 'Rock', icon: '🤘' },
  { id: 'hiphop', title: 'Hip-Hop', icon: '🔥' },
  { id: 'classical', title: 'Classical', icon: '🎼' },
  { id: 'folk', title: 'Folk', icon: '🪕' },
  { id: 'metal', title: 'Metal', icon: '⚔️' },
  { id: 'rnb', title: 'R&B', icon: '💜' },
  { id: 'country', title: 'Country', icon: '🤠' },
  { id: 'lofi', title: 'Lo-Fi', icon: '☁️' },
  { id: 'experimental', title: 'Experimental', icon: '🔮' },
  { id: 'collab', title: 'Open Collab', icon: '🤝' },
];

export function getInterestById(id: string): Interest | undefined {
  return INTERESTS.find((i) => i.id === id);
}

export function getInterestTitle(id: string): string {
  return getInterestById(id)?.title ?? id;
}
