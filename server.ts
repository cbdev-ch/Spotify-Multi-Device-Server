import express, { Request, Response } from "express";
import mongoose from "mongoose";
import bodyParser = require("body-parser");
import * as config from "./config.json";
import SpotifyWebApi from "spotify-web-api-node";
import uuidv1 from "uuid/v1";

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

let users: { [id: string] : { spotifyApi: SpotifyWebApi, state: string} } = {};

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

    res.redirect(new SpotifyWebApi(credentials).createAuthorizeURL(scopes, uuidv1()));
});

//Acts as a callback for the spotify login
app.get("/callback", async (req: Request, res: Response) => {
    let code = req.query["code"];
    let state = req.query["state"];

    let spotifyApi = new SpotifyWebApi(credentials);

    spotifyApi.authorizationCodeGrant(code).then((data) => {
        spotifyApi.setAccessToken(data.body["access_token"]);
        spotifyApi.setRefreshToken(data.body["refresh_token"]);

        spotifyApi.getMe().then((me) => {
            users[me.body.id] = { 
                spotifyApi: new SpotifyWebApi({ 
                    accessToken: data.body["access_token"], 
                    refreshToken: data.body["refresh_token"]
                }),
                state: state
            };

            res.status(204).send();
        }).catch((error) => {
            console.log(error);
            res.status(500).send(error);
        });
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

//Gets the spotify ID with the unique login state
app.get("/identification/:state", async (req: Request, res: Response ) => {
    let id = undefined;
    Object.keys(users).forEach(key => {
        if (users[key].state === req.params["state"]) {
            res.send({ spotifyId: key });
        }
    });

    if (id === undefined) {
        res.status(404).send("There is no logged in user with the provided state.");
    }
});

//Gets the login status with the spotify ID
app.get("/loginstatus/:spotifyId", async (req: Request, res: Response) => {
    if (users[req.params["spotifyId"]]) {
        res.send({ loginStatus: "logged_in" });
    }

    else {
        res.send({ loginStatus: "logged_out" });
    }
});

//Does the logout with the spotify ID
app.post("/logout/:spotifyId", async (req: Request, res: Response) => {
    if (users[req.params["spotifyId"]]) {
        delete users[req.params["spotifyId"]];
        res.status(204).send();
    }
    
    else {
        res.status(404).send("There is no logged in user with the provided Spotify Id");
    }
});


//LOBBIES

//Gets all lobbies
app.get("/lobbies", async (req: Request, res: Response) => {
    res.status(501).send("Not implemented yet");
});

//Gets lobby ID with participant ID
app.get("/lobbies/search", async (req: Request, res: Response) => {
    let participantId: string = req.query["participantId"];


    LobbyData.findOne({ participantUserIds: { $all: [participantId] } }, { _id: 1 }).then((lobbyData) => {
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

    LobbyData.findById(id).then(async (lobbyData) => {
        if (lobbyData) {
            let lobby: Lobby = {
                id: id,
                leaderSpotifyId: lobbyData.get("leaderSpotifyId"),
                participantUsers: await Promise.all(lobbyData.get("participantUserIds").map(async (participantId: string) => {
                    let participant = await users[participantId].spotifyApi.getMe();
                    let user: User = {
                        spotifyId: participantId,
                        spotifyDisplayName: participant.body.display_name,
                        spotifyProfilePictureUrl: participant.body.images && participant.body.images.length > 0 ? participant.body.images[0].url : undefined
                    }
                    return user;
                })),
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
                }))
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
    let leaderId: string = req.query["leaderId"];

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
    let participantId: string = req.query["participantId"];
    let lobbyId: string = req.query["lobbyId"];

    LobbyData.findByIdAndUpdate(lobbyId, { $push: { participantUserIds: participantId }}).then((lobbyData) => {
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
    let participantId: string = req.query["participantId"];
    let lobbyId: string = req.query["lobbyId"];

    LobbyData.findByIdAndUpdate(lobbyId, { $pull: { participantUserIds: participantId }}).then((lobbyData) => {
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

//Closes lobby with lobby ID
app.delete("/lobbies/close", async (req: Request, res: Response) => {
    let lobbyId: string = req.query["lobbyId"];

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


//SERVER AND DATABASE

console.log("Connecting to MongoDB...");
mongoose.connect("mongodb://VLD-COL-1.intnet.ch:27017/smd", { useNewUrlParser: true, useFindAndModify: false, useCreateIndex: true, useUnifiedTopology: true }).then(result => {
    console.log("Connected to MongoDB!");
    console.log("Express is starting up...");
    app.listen(8080, () => console.log("Express is now running!"));
}).catch((error) => {
    console.log(error);
});