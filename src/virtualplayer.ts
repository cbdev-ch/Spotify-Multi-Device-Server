import { Song } from "./models/api/lobby";
import { Player } from "./models/api/player";

export default class VirtualPlayer implements Player {
    id: string;

    position: number; // in ms
    maxPosition: number;
    isSongPlaying: boolean;

    queuePosition: number;
    queue: Song[];

    version: number;

    private clock: NodeJS.Timeout; // clock Interval

    constructor(id: string) {
        this.id = id;
        this.position = 0;
        this.maxPosition = 0;
        this.isSongPlaying = false;

        this.queuePosition = 0;
        this.queue = [];

        this.version = 0;
    }

    resume() {
        if (!this.isSongPlaying) {

            this.isSongPlaying = true;

            this.clock = setInterval(() => {
                if (this.position >= this.maxPosition) {
                    this.next();
                }

                this.position += 200;
            }, 200);

            this.version += 1;
        }
    }

    pause() {
        if (this.isSongPlaying) {

            this.isSongPlaying = false;
            clearInterval(this.clock);

            this.version += 1;
        }
    }

    next() {
        if (this.queuePosition < this.queue.length - 1) {
            this.queuePosition += 1;
        } else { // Go to queue start again if at last
            this.queuePosition = 0;
        }

        this.position = 0;
        this.version += 1;
    }

    previous() {
        if (this.queuePosition > 0) {
            this.queuePosition -= 1;
        }

        this.position = 0;
        this.version += 1;
    }

    jump(position: number) {
        this.position = position;
        this.version += 1;
    }
}