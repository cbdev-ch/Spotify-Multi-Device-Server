import express, { Request, Response } from "express";
import mongoose from "mongoose";
import bodyParser = require("body-parser");
import * as config from "./config.json";
import SpotifyWebApi from "spotify-web-api-node";
import fs from "fs";
import uuidv1 from "uuid/v1";


const app = express();

const credentials = {
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    clientSecret: config.clientSecret
}

let users: { [id: string] : { spotifyApi: SpotifyWebApi, state: string} } = {};

app.use(bodyParser.json());

app.get("/", (req: Request, res: Response) => {
    res.send("Success");
});

//AUTHENTICATION
app.get("/login", (req: Request, res: Response) => {
    let scopes = ["user-read-private"];

    res.redirect(new SpotifyWebApi(credentials).createAuthorizeURL(scopes, uuidv1()));
});

app.get("/callback", async (req: Request, res: Response) => {
    let code = req.query["code"];
    let state = req.query["state"];

    let spotifyApi = new SpotifyWebApi(credentials);

    spotifyApi.authorizationCodeGrant(code).then((data) => {
        spotifyApi.setAccessToken(data.body["access_token"]);
        spotifyApi.setRefreshToken(data.body["refresh_token"]);

        spotifyApi.getMe().then((me) => {
            users[me.body.id] = { spotifyApi: spotifyApi, state: state };
            res.status(204).send("<h1>Logged in!</h1>");
        }, (err) => {
            console.log(err);
            res.status(500).send(err);
        });
    }, (err) => {
        console.log(err);
        res.status(500).send(err);
    });
});

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

app.get("/loginstatus/:spotifyId", async (req: Request, res: Response) => {
    if (users[req.params["spotifyId"]]) {
        res.send({ loginStatus: "logged_in" });
    }

    else {
        res.send({ loginStatus: "logged_out" });
    }
});

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
app.get("/lobbies/:id", async (req: Request, res: Response) => {
    //TODO Check if a lobby with the provided Id exists
    if (req.params["id"] === "99999") {
        res.status(200).send({
            id: "99999",
            leaderSpotifyId: "88",
            participantUsers: [
                { spotifyId: "88", spotifyDisplayName: "Adlersson", spotifyProfilePictureUrl: "https://steamuserimages-a.akamaihd.net/ugc/939447311825403335/0C0279F94A44104373CB2807A4BB70B4117EFB9A/"},
                { spotifyId: "44", spotifyDisplayName: "Inkognito", spotifyProfilePictureUrl: "https://vignette.wikia.nocookie.net/youtube/images/f/f9/Inkognito_Spastiko.jpg/revision/latest?cb=20170225153545&path-prefix=de"}
            ],
            currentSongId: "69",
            currentPlayerPosition: 0,
            queuedSongs: [
                { spotifyId: "69", queuerId: "44", name: "Mo sicko", artistNames: ["Tracktor Bot", "Drake Bake"], duration: 180, imageUrl: "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/Sicko_Mode_cover.jpg/220px-Sicko_Mode_cover.jpg"},
                { spotifyId: "420", queuerId: "88", name: "Rainbow", artistNames: ["Mr. Steal-Your-Girl"], duration: 500, imageUrl: "https://images-na.ssl-images-amazon.com/images/I/61yoTtDxuiL._SX425_.jpg"}
            ]
        });
    }
    else {
        res.status(404).send("There is no lobby with the provided Id");
    }
});

app.get("/lobbies", async (req: Request, res: Response) => {
    if (req.query["userId"]) {
        //TODO Check if provided user is in a lobby
        res.send({
            id: "99999",
            leaderSpotifyId: "88",
            participantUsers: [
                { spotifyId: "88", spotifyDisplayName: "Adlersson", spotifyProfilePictureUrl: "https://steamuserimages-a.akamaihd.net/ugc/939447311825403335/0C0279F94A44104373CB2807A4BB70B4117EFB9A/"},
                { spotifyId: "44", spotifyDisplayName: "Inkognito", spotifyProfilePictureUrl: "https://vignette.wikia.nocookie.net/youtube/images/f/f9/Inkognito_Spastiko.jpg/revision/latest?cb=20170225153545&path-prefix=de"}
            ],
            currentSongId: "69",
            currentPlayerPosition: 0,
            queuedSongs: [
                { spotifyId: "69", queuerId: "44", name: "Mo sicko", artistNames: ["Tracktor Bot", "Drake Bake"], duration: 180, imageUrl: "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/Sicko_Mode_cover.jpg/220px-Sicko_Mode_cover.jpg"},
                { spotifyId: "420", queuerId: "88", name: "Rainbow", artistNames: ["Mr. Steal-Your-Girl"], duration: 500, imageUrl: "https://images-na.ssl-images-amazon.com/images/I/61yoTtDxuiL._SX425_.jpg"}
            ]
        });
    }
    else {
        //TODO Send all Lobbies
        res.status(501).send("Not implemented yet");
    }
});

/*console.log("Connecting to MongoDB...");
mongoose
    .connect("mongodb://127.0.0.1:27017/smd", { useNewUrlParser: true })
    .then(result => {
        console.log("Connected to MongoDB!");
        console.log("Express is starting up...");
        app.listen(8080, () => console.log("Express is now running!"));
    })
    .catch(err => {
        console.log(err);
    });*/
console.log("Express is starting up...");
app.listen(8080, () => console.log("Express is now running!"));