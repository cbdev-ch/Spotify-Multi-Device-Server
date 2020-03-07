import { Song } from "./lobby";

export interface Player {
    id: string;
    position: number; // in ms
    maxPosition: number;
    isSongPlaying: boolean;
    queuePosition: number;
    queue: Song[];
    version: number;
}