import { Player, Device } from "./models/api/player";
import { Observable, BehaviorSubject } from "rxjs";
import SpotifyWebApi = require("spotify-web-api-node");
import { Song } from "./models/api/song";
import { QueuedSong } from "./models/api/queuedsong";

export default class VirtualPlayer implements Player {
    id: string;

    position: number; // in ms
    isSongPlaying: boolean;

    queuePosition: number;
    queue: QueuedSong[];

    currentDeviceId: string;
    devices: Device[];

    version: number;

    host: SpotifyWebApi;

    private clock: NodeJS.Timeout; // clock Interval

    get maxPosition() {
        return this.queue.length > 0 ? this.queue[this.queuePosition].duration : 0;
    }

    constructor(id: string, host: SpotifyWebApi) {
        this.id = id;
        this.host = host;

        this.position = 0;
        this.isSongPlaying = false;

        this.queuePosition = 0;
        this.queue = [];

        setInterval(() => {
            this.host.getMyDevices().then((result) => {
                let devices: Device[] = [];
                for (let device of result.body.devices) {
                    devices.push({
                        spotifyid: device.id,
                        name: device.name,
                        type: device.type,
                        isActive: device.is_active
                    });
                }

                if (this.devices !== devices) {
                    this.version += 1;
                }
                this.devices = devices;
            });
        }, 5000);

        this.version = 0;
    }

    selectDevice(deviceId: string) {
        this.host.transferMyPlayback({
            // @ts-ignore
            deviceIds: [deviceId]
        }).then(() => {
            this.currentDeviceId = deviceId;
            this.version += 1;
        }).catch((error: any) => {
            this.pause();
            console.log(error);
        });
    }

    resume() {
        if (!this.isSongPlaying && this.devices.length > 0) {
            new Promise<void>((resolve, reject) => {
                if (!this.devices.find(device => device.isActive)) {
                    let deviceId = this.devices[0].spotifyid;
                    this.host.transferMyPlayback({
                        // @ts-ignore
                        deviceIds: [deviceId]
                    }).then(() => {
                        this.currentDeviceId = deviceId;
                        resolve();
                    }).catch((error: any) => {
                        reject(error);
                    });
                } else {
                    resolve();
                }
            }).then(() => {
                this.host.play({
                    uris: [this.queue[this.queuePosition].spotifyUri],
                    position_ms: this.position // doesn't work at the moment
                }).then(() => {
                    this.host.seek(this.position).then(() => {
                        this.isSongPlaying = true;
    
                        this.clock = setInterval(() => {
                            if (this.position >= this.maxPosition) {
                                this.next();
                            }
            
                            this.position += 200;
                        }, 200);
    
                        this.version += 1;
                    }).catch((error) => {
                        console.log(error);
                    });
                }).catch((error) => {
                    this.pause();
                    console.log(error);
                });
            });
        }
    }

    pause() {
        if (this.isSongPlaying) {

            this.host.pause().then(() => {
                this.isSongPlaying = false;

                clearInterval(this.clock);

                this.version += 1;
            }).catch((error) => {
                this.pause();
                console.log(error);
            });
        }
    }

    next() {
        if (this.queuePosition < this.queue.length - 1) {
            this.queuePosition += 1;
        } else { // Go to queue start again if at last
            this.queuePosition = 0;
        }

        this.host.play({
            uris: [this.queue[this.queuePosition].spotifyUri],
            position_ms: 0
        }).then(() => {
            this.position = 0;
            this.version += 1;

        }).catch((error) => {
            this.pause();
            console.log(error);
        });
    }

    previous() {
        if (this.queuePosition > 0) {
            this.queuePosition -= 1;
        }

        this.host.play({
            uris: [this.queue[this.queuePosition].spotifyUri],
            position_ms: 0
        }).then(() => {
            this.position = 0;
            this.version += 1;

        }).catch((error) => {
            this.pause();
            console.log(error);
        });
    }

    jump(position: number) {

        this.host.seek(position).then(() => {
            this.position = position;
            this.version += 1;
        }).catch((error) => {
            this.pause();
            console.log(error);
        });
    }

    queueSong(song: QueuedSong) {
        this.queue.push(song);

        // if is first song begin playing
        if (this.queue.length === 1) {
            this.resume();
        }
    }
}