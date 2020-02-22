import express, { Request, Response, response } from "express";
import mongoose from "mongoose";
import bodyParser = require("body-parser");
import * as config from "./config.json";
import SpotifyWebApi from "spotify-web-api-node";
import uuidv1 from "uuid/v1";
import cors from "cors";

//Mongoose Models
import LobbyData from "./models/db/lobbyData";

//API Models
import { Lobby, User, Song } from "./models/api/lobby";

const app = express();

const credentials = {
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    clientSecret: config.clientSecret
}

let logins: { [state: string] : { spotifyId: string }} = {};
let users: { [spotifyId: string] : { spotifyApi: SpotifyWebApi } } = {};

app.use(cors());
app.use(bodyParser.json());

//DEBUGGING

app.get("/", (req: Request, res: Response) => {
    res.send("Online");
});

app.get("/users", (req: Request, res: Response) => {
    res.send(users);
});


//AUTHENTICATION

//Forwards to the spotify login
app.get("/login", (req: Request, res: Response) => {
    let scopes = ["user-read-private"];
    let state = uuidv1();

    logins[state] = { spotifyId: null };
    res.redirect(new SpotifyWebApi(credentials).createAuthorizeURL(scopes, state));
});

//Authenticates states and codes
app.post("/authenticate", async (req: Request, res: Response) => {
    let state = req.body["state"];
    let code = req.body["code"];

    // Trust authentication
    if (logins[state]) {

        // Login
        if (code) {
            let spotifyApi = new SpotifyWebApi(credentials);

            spotifyApi.authorizationCodeGrant(code).then((data) => {

                spotifyApi.setAccessToken(data.body.access_token);
                spotifyApi.setRefreshToken(data.body.refresh_token);

                spotifyApi.getMe().then((me) => {
                    logins[state] = { spotifyId: me.body.id };
                    users[me.body.id] = { spotifyApi };

                    refreshToken(users[me.body.id].spotifyApi, data.body.expires_in);

                    res.send({ authorized: true, spotifyId: me.body.id });
                }).catch((error) => {
                    console.log(error);
                    res.status(500).send(error);
                });
            }).catch((error) => {
                console.log(error);
                res.status(500).send(error);
            });
        } else {
            if (logins[state].spotifyId) {
                res.send({ authorized: true, spotifyId: logins[state].spotifyId });
            }
            else {
                res.send({ authorized: false });
            }
        }
    } else {
        res.send({ authorized: false });
    }
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
    let client = new SpotifyWebApi(credentials);

    console.log("USERS");
    console.log(users);

    LobbyData.findById(id).then(async (lobbyData) => {
        await client.getMe
        if (lobbyData) {
            let lobby: Lobby = {
                id: id,
                leaderSpotifyId: lobbyData.get("leaderSpotifyId"),
                participantUsers: lobbyData.get("participantUserIds").map(async (participantId: string) => {
                    console.log("PARTICIPANTS");
                    console.log(participantId);
                    let participant = (await users[participantId].spotifyApi.getMe()).body;
                    let user: User = {
                        spotifyId: participantId,
                        spotifyDisplayName: participant.display_name,
                        spotifyProfilePictureUrl: participant.images && participant.images.length > 0 ? participant.images[0].url : undefined
                    }
                    return user;
                }),
                currentSongId: lobbyData.get("currentSongSpotifyId"),
                currentPlayerPosition: lobbyData.get("currentPlayerPosition"),
                queuedSongs: await Promise.all(lobbyData.get("queuedSongs").map(async (songData: any) => {
                    let queuer = await client.getUser(songData["queuerId"]);
                    let track = await client.getTrack(songData["spotifyId"]);
                    let song: Song = {
                        spotifyId: songData["spotifyId"],
                        queuer: {
                            spotifyId: queuer.body.id,
                            spotifyDisplayName: queuer.body.display_name,
                            spotifyProfilePictureUrl: queuer.body.images && queuer.body.images.length > 0 ? queuer.body.images[0].url : undefined
                        },
                        name: track.body.name,
                        artistNames: track.body.artists.map(artistData => artistData.name),
                        duration: track.body.duration_ms / 1000,
                        imageUrl: track.body.album.images[2].url
                    }
                    return song;
                })),
                version: lobbyData.__v ? lobbyData.__v : -2
            };
            res.send(lobby);
        }
        else {
            res.send(404).send();
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send();
    });
});

//Create lobby with leader ID
app.post("/lobbies/create", async (req: Request, res: Response) => {
    let leaderId: string = req.body["leaderId"];

    let lobby = new LobbyData({ leaderSpotifyId: leaderId, participantUserIds: [leaderId ] });

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
            res.status(404).send();
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
            res.status(404).send();
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
            res.status(204).send();
        }
        else {
            res.status(404).send();
        }
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

function refreshToken(client: SpotifyWebApi, expiresIn: number) {
    if (client) {
        setTimeout(() => {
            client.refreshAccessToken().then((data) => {
                client.setAccessToken(data.body.access_token);
                refreshToken(client, data.body.expires_in);
            });
        }, expiresIn - 300);
    }
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