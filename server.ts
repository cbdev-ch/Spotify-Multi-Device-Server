import express, { Request, Response } from "express";
import mongoose from "mongoose";
import bodyParser = require("body-parser");
import * as config from "./config.json";
import SpotifyWebApi from "spotify-web-api-node";
import https from "https";
import fs from "fs";
import uuidv1 from "uuid/v1";


const app = express();
const key = fs.readFileSync("certificate/server.key", "utf8");
const certificate = fs.readFileSync("certificate/server.crt", "utf8");
const server = https.createServer({ key: key, cert: certificate }, app);

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

app.get("/logout/:spotifyId", async (req: Request, res: Response) => {
    if (users[req.params["spotifyId"]]) {
        delete users[req.params["spotifyId"]];
        res.status(204).send();
    }
    
    else {
        res.status(404).send("There is no logged in user with the provided Spotify Id");
    }
});

console.log("Connecting to MongoDB...");
mongoose
    .connect("mongodb://127.0.0.1:27017/smd", { useNewUrlParser: true })
    .then(result => {
        console.log("Connected to MongoDB!");
        console.log("Express is starting up...");
        server.listen(8443, () => console.log("Express is now running!"));
    })
    .catch(err => {
        console.log(err);
    });