import express, { Request, Response, response, urlencoded } from "express";
import mongoose from "mongoose";
import bodyParser = require("body-parser");
import * as config from "./config.json";
import SpotifyWebApi from "spotify-web-api-node";
import uuidv1 from "uuid/v1";
import cors from "cors";
import QRCode from "qrcode";

//Mongoose Models
import LobbyData from "./models/db/lobbyData";

//API Models
import { Player } from "./models/api/player.js";
import { Invitation } from "./models/api/invitation";

//Core
import VirtualPlayer from "./virtualplayer.js";
import { LocalUser } from "./models/api/localuser";
import { User } from "./models/api/user";
import { Lobby } from "./models/api/lobby";
import { Song } from "./models/api/song";

const app = express();

const credentials = {
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    clientSecret: config.clientSecret
}

let client = new SpotifyWebApi(credentials);

let logins: { [state: string] : { spotifyId: string, authorized: boolean }} = {};
let users: { [spotifyId: string] : { spotifyApi: SpotifyWebApi } } = {};

let players: { [playerId: string] : VirtualPlayer } = {};

let invitations: string[] = [];

app.use(cors());
app.use(bodyParser.json());

client.clientCredentialsGrant().then((data) => {
    client.setAccessToken(data.body.access_token);

    refreshClientToken(data.body.expires_in);
});

//DEBUGGING

app.get("/", (req: Request, res: Response) => {
    res.send("Online");
});

app.get("/users", (req: Request, res: Response) => {
    res.send(users);
});

app.get("/players", (req: Request, res: Response) => {
    res.send(Object.keys(players).map((key) => {
        let virtualPlayer = players[key];
        return {
            id: virtualPlayer.id,
            position: virtualPlayer.position,
            maxPosition: virtualPlayer.maxPosition,
            isSongPlaying: virtualPlayer.isSongPlaying,
            queuePosition: virtualPlayer.queuePosition,
            queue: virtualPlayer.queue,
            currentDeviceId: virtualPlayer.currentDeviceId,
            devices: virtualPlayer.devices,
            version: virtualPlayer.version
        };
    }));
});


//AUTHENTICATION

//Forwards to the spotify login
app.get("/login", (req: Request, res: Response) => {
    let scopes = [
        "user-read-private",
        "user-modify-playback-state",
        "user-read-playback-state"
    ];
    let state = req.query["state"];

    logins[state] = { spotifyId: null, authorized: null };
    res.redirect(client.createAuthorizeURL(scopes, state));
});

// Callback from spotify
app.get("/callback", async(req: Request, res: Response) => {
    let state = req.query["state"];
    let code = req.query["code"];

    if (code) {
        client.authorizationCodeGrant(code).then((data) => {

            let spotifyApi = new SpotifyWebApi({
                accessToken: data.body.access_token,
                refreshToken: data.body.refresh_token
            });

            spotifyApi.getMe().then((me) => {
                logins[state] = { spotifyId: me.body.id, authorized: true };
                users[me.body.id] = { spotifyApi };

                refreshToken(me.body.id, data.body.expires_in);

                res.type('html');
                res.send('<script type="text/javascript">window.close();</script>');
            }).catch((error) => {
                console.log(error);
                res.status(500).send(error);
            });
        }).catch((error) => {
            console.log(error);
            res.status(500).send(error);
        });
    } else {
        logins[state] = { spotifyId: undefined, authorized: false };
        res.type('html');
        res.send('<script type="text/javascript">window.close();</script>');
    }
});

//Authenticates states
app.post("/authenticate", async (req: Request, res: Response) => {
    let state = req.body["state"];

    if (state) {
        let login = logins[state];

        // Trust authentication
        if (login && login.authorized) {
            if (users[login.spotifyId]) {

                let me = await users[login.spotifyId].spotifyApi.getMe();
                let user: LocalUser = {
                    spotifyId: me.body.id,
                    displayName: me.body.display_name,
                    profilePictureUrl: me.body.images && me.body.images.length > 0 ? me.body.images[0].url : undefined,
                    footprint: state,
                    isPremium: me.body.product === "premium"
                }

                res.send({
                    authorized: true,
                    user
                });

                return;
            }
        }
    }

    res.send({
        authorized: false
    });
});


//LOBBIES

//Gets the lobby version
app.get("/lobbies/version/:id", async (req: Request, res: Response) => {
    let id = req.params["id"];

    LobbyData.findById(id).then(async (lobbyData) => {
        if (lobbyData) {
            res.send({ version: lobbyData.__v });
        }
        else {
            //Version -1 means the lobby got delted
            res.send({ version: -1 });
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send();
    });
});

//Gets all lobbies
app.get("/lobbies", async (req: Request, res: Response) => {
    res.status(501).send("Not implemented yet");
});

//Search lobby by userId or lobbyId
app.get("/lobbies/search", async (req: Request, res: Response) => {
    let participantId: string = req.query["participantId"];
    let lobbyId: string = req.query["lobbyId"];

    LobbyData.findOne({ $or: [{ participantUserIds: { $all: [participantId] } }, { _id: lobbyId }] }, { _id: 1 }).then((lobbyData) => {
        if (lobbyData) {
            res.send({ lobbyId: lobbyData.get("_id") });
        }
        else {
            res.send();
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

//Gets lobby wtih lobby ID
app.get("/lobbies/get/:id", async (req: Request, res: Response) => {
    let id = req.params["id"];

    LobbyData.findById(id).then(async (lobbyData) => {
        if (lobbyData) {
            let player = players[lobbyData.get("playerId")];
            let lobby: Lobby = {
                id: id,
                leaderSpotifyId: lobbyData.get("leaderSpotifyId"),
                participantUsers: await Promise.all(lobbyData.get("participantUserIds").map(async (participantId: string) => {
                    let participant = (await client.getUser(participantId)).body;
                    let user: User = {
                        spotifyId: participant.id,
                        displayName: participant.display_name,
                        profilePictureUrl: participant.images && participant.images.length > 0 ? participant.images[0].url : undefined,
                    }
                    return user;
                })),
                currentSongIndex: player.queuePosition,
                queuedSongs: player.queue,
                playerId: lobbyData.get("playerId"),
                version: lobbyData.__v !== undefined ? lobbyData.__v : 0
            };
            res.send(lobby);
        }
        else {
            res.status(404).send("Lobby not found!");
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send();
    });
});

//Create lobby with leader ID
app.post("/lobbies/create", async (req: Request, res: Response) => {
    let leaderId: string = req.body["leaderId"];

    let player = new VirtualPlayer(uuidv1(), users[leaderId].spotifyApi);
    players[player.id] = player;

    let lobby = new LobbyData({ leaderSpotifyId: leaderId, participantUserIds: [leaderId], playerId: player.id });

    lobby.save().then((result) => {
        res.send({ lobbyId: result.id });
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

//Joins lobby with lobby ID and participant ID
app.patch("/lobbies/join", async (req: Request, res: Response) => {
    let participantId: string = req.body["participantId"];
    let lobbyId: string = req.body["lobbyId"];

    LobbyData.findByIdAndUpdate(lobbyId, { $push: { participantUserIds: participantId }, $inc: { __v: 1 }}).then((lobbyData) => {
        if (lobbyData) {
            res.status(204).send();
        }
        else {
            res.status(404).send("Lobby not found!");
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

//Leaves lobby with lobby ID and participant ID
app.patch("/lobbies/leave", async (req: Request, res: Response) => {
    let participantId: string = req.body["participantId"];
    let lobbyId: string = req.body["lobbyId"];

    LobbyData.findByIdAndUpdate(lobbyId, { $pull: { participantUserIds: participantId, $inc: { __v: 1 }}}).then((lobbyData) => {
        if (lobbyData) {
            lobbyData.increment();
            lobbyData.save();
            res.status(204).send();
        }
        else {
            res.status(404).send("Lobby not found!");
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

//Closes lobby with lobby ID
app.delete("/lobbies/close/:lobbyId", async (req: Request, res: Response) => {
    let lobbyId: string = req.params["lobbyId"];

    LobbyData.findByIdAndDelete(lobbyId).then((lobbyData) => {
        if (lobbyData) {
            delete players[lobbyData.get("playerId")];
            res.status(204).send();
        }
        else {
            res.status(404).send("Lobby not found!");
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

// Invitation
app.post("/invitation/generate", async (req: Request, res: Response) => {
    let lobbyId: string = req.body["lobbyId"];

    if (lobbyId) {
        let id = uuidv1();
        let url = config.clientPage + "/invitation/" + lobbyId + "/?id=" + encodeURIComponent(id);

        QRCode.toDataURL(url, {
            errorCorrectionLevel: 'L',
        }).then((dataUrl) => {
            let invitation: Invitation = {
                id,
                url,
                qrcode: dataUrl
            };

            invitations.push()
            res.send(invitation);
        }).catch((error) => {
            console.log(error);
            res.status(500).send(error);
        });
    } else {
        res.status(400).send("Body parameter 'lobbyId' missing!");
    }
});

app.get("/invitation/verify/:id", async (req: Request, res: Response) => {
    let invitationId = req.params["id"];

    if (invitations.find(id => id === invitationId)) {
        res.send({
            verified: true
        });
    } else {
        res.send({
            verified: false
        });
    }
});


// PLAYER

app.get("/player/version/:id", async (req: Request, res: Response) => {
    let playerId = req.params["id"];

    if (playerId) {
        res.send({ version: players[playerId].version });
    } else {
        res.status(404).send();
    }
});

app.get("/player/get/:id", async (req: Request, res: Response) => {
    let playerId = req.params["id"];

    if (playerId) {
        let virtualPlayer = players[playerId];
        let player: Player = {
            id: virtualPlayer.id,
            position: virtualPlayer.position,
            maxPosition: virtualPlayer.maxPosition,
            isSongPlaying: virtualPlayer.isSongPlaying,
            queuePosition: virtualPlayer.queuePosition,
            queue: virtualPlayer.queue,
            currentDeviceId: virtualPlayer.currentDeviceId,
            devices: virtualPlayer.devices,
            version: virtualPlayer.version
        };

        res.send(player);
    } else {
        res.status(404).send("Player not found!");
    }
});

app.get("/player/position/:id", async (req: Request, res: Response) => {
    let playerId = req.params["id"];

    if (playerId) {
        res.send({ position: players[playerId].position });
    } else {
        res.status(404).send("Player not found!");
    }
});

app.patch("/player/pause", async (req: Request, res: Response) => {
    let playerId = req.body["playerId"];
    let player = players[playerId];

    if (player) {
        player.pause();
        res.status(204).send();
    } else {
        res.status(404).send("Player not found!");
    }
});

app.patch("/player/resume", async (req: Request, res: Response) => {
    let playerId = req.body["playerId"];
    let player = players[playerId];

    if (player) {
        player.resume();
        res.status(204).send();
    } else {
        res.status(404).send("Player not found!");
    }
});

app.patch("/player/previous", async (req: Request, res: Response) => {
    let playerId = req.body["playerId"];
    let player = players[playerId];

    if (player) {
        player.previous();
        res.send({ queuePosition: player.queuePosition });
    } else {
        res.status(404).send("Player not found!");
    }
});

app.patch("/player/next", async (req: Request, res: Response) => {
    let playerId = req.body["playerId"];
    let player = players[playerId];

    if (player) {
        player.next();
        res.send({ queuePosition: player.queuePosition });
    } else {
        res.status(404).send("Player not found!");
    }
});

app.patch("/player/jump", async (req: Request, res: Response) => {
    let playerId = req.body["playerId"];
    let player = players[playerId];

    let position = req.body["position"];

    if (player) {
        player.jump(position);
        res.status(204).send();
    } else {
        res.status(404).send("Player not found!");
    }
});

app.patch("/player/device/select", async (req: Request, res: Response) => {
    let playerId = req.body["playerId"];
    let player = players[playerId];

    let deviceId = req.body["deviceId"];

    if (player) {
        player.selectDevice(deviceId);
        res.status(204).send();
    } else {
        res.status(404).send("Player not found!");
    }
});

//SEARCH
app.get("/search/song", async (req: Request, res: Response) => {
    let query = req.query["query"];
    let limit = +req.query["limit"];
    let market = req.query["market"];

    client.searchTracks(query, {
        market,
        limit,
        offset: 0
    }).then((result) => {
        let songs: Song[] = [];

        for (let song of result.body.tracks.items) {
            songs.push({
                spotifyId: song.id,
                spotifyUri: song.uri,
                name: song.name,
                artistNames: song.artists.map(artistData => artistData.name),
                duration: song.duration_ms,
                imageUrl: song.album.images[2].url
            });
        }

        res.send(songs);
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

//QUEUE
app.post("/queue/add", async (req: Request, res: Response) => {
    let lobbyId = req.body["lobbyId"];
    let queuerId = req.body["queuerId"];
    let songId = req.body["songId"];

    LobbyData.findById(lobbyId).then(async (lobbyData) => {
        if (lobbyData) {
            let player = players[lobbyData.get("playerId")];

            let queuer = (await client.getUser(queuerId)).body;
            let track = await client.getTrack(songId);

            player.queueSong({
                spotifyId: songId,
                spotifyUri: track.body.uri,
                queuer: {
                    spotifyId: queuer.id,
                    displayName: queuer.display_name,
                    profilePictureUrl: queuer.images && queuer.images.length > 0 ? queuer.images[0].url : undefined,
                },
                name: track.body.name,
                artistNames: track.body.artists.map(artistData => artistData.name),
                duration: track.body.duration_ms,
                imageUrl: track.body.album.images[2].url
            });

            player.version += 1;
            lobbyData.__v += 1;
            lobbyData.save();

            res.status(204).send();
        } else {
            res.status(404).send("Lobby not found!");
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send();
    });
});

function refreshToken(spotifyId: string, expiresIn: number) {
    let client = new SpotifyWebApi(credentials);
    let spotifyApi = users[spotifyId].spotifyApi;
    client.setRefreshToken(spotifyApi.getRefreshToken());

    if (spotifyApi) {
        setTimeout(() => {
            console.log("Refresh Access Token on: " + spotifyApi.getAccessToken());
            client.refreshAccessToken().then((data) => {
                spotifyApi.setAccessToken(data.body.access_token);
                refreshToken(spotifyId, data.body.expires_in);
            });
        }, (expiresIn - 300) * 1000);
    }
}

function refreshClientToken(expiresIn: number) {
    setTimeout(() => {
        console.log("Refresh Client Access Token");
        client.refreshAccessToken().then((data) => {
            refreshClientToken(data.body.expires_in);
        });
    }, (expiresIn - 300) * 1000);
}

//SERVER AND DATABASE

console.log("Connecting to MongoDB...");
mongoose.connect("mongodb://VLD-COL-1.intnet.ch:27017/smd", { useNewUrlParser: true, useFindAndModify: false, useCreateIndex: true, useUnifiedTopology: true }).then(result => {
    console.log("Connected to MongoDB!");
    console.log("Express is starting up...");
    app.listen(8080, () => console.log("Express is now running!"));
}).catch((error) => {
    console.log(error);
});