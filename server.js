"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var bodyParser = require("body-parser");
var config = __importStar(require("./config.json"));
var spotify_web_api_node_1 = __importDefault(require("spotify-web-api-node"));
var v1_1 = __importDefault(require("uuid/v1"));
var app = express_1.default();
var credentials = {
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    clientSecret: config.clientSecret
};
var users = {};
app.use(bodyParser.json());
app.get("/", function (req, res) {
    res.send("Success");
});
//AUTHENTICATION
app.get("/login", function (req, res) {
    var scopes = ["user-read-private"];
    res.redirect(new spotify_web_api_node_1.default(credentials).createAuthorizeURL(scopes, v1_1.default()));
});
app.get("/callback", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    var code, state, spotifyApi;
    return __generator(this, function (_a) {
        code = req.query["code"];
        state = req.query["state"];
        spotifyApi = new spotify_web_api_node_1.default(credentials);
        spotifyApi.authorizationCodeGrant(code).then(function (data) {
            spotifyApi.setAccessToken(data.body["access_token"]);
            spotifyApi.setRefreshToken(data.body["refresh_token"]);
            spotifyApi.getMe().then(function (me) {
                users[me.body.id] = { spotifyApi: spotifyApi, state: state };
                res.status(204).send("<h1>Logged in!</h1>");
            }, function (err) {
                console.log(err);
                res.status(500).send(err);
            });
        }, function (err) {
            console.log(err);
            res.status(500).send(err);
        });
        return [2 /*return*/];
    });
}); });
app.get("/identification/:state", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    var id;
    return __generator(this, function (_a) {
        id = undefined;
        Object.keys(users).forEach(function (key) {
            if (users[key].state === req.params["state"]) {
                res.send({ spotifyId: key });
            }
        });
        if (id === undefined) {
            res.status(404).send("There is no logged in user with the provided state.");
        }
        return [2 /*return*/];
    });
}); });
app.get("/loginstatus/:spotifyId", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        if (users[req.params["spotifyId"]]) {
            res.send({ loginStatus: "logged_in" });
        }
        else {
            res.send({ loginStatus: "logged_out" });
        }
        return [2 /*return*/];
    });
}); });
app.post("/logout/:spotifyId", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        if (users[req.params["spotifyId"]]) {
            delete users[req.params["spotifyId"]];
            res.status(204).send();
        }
        else {
            res.status(404).send("There is no logged in user with the provided Spotify Id");
        }
        return [2 /*return*/];
    });
}); });
//LOBBIES
app.get("/lobbies/:id", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        //TODO Check if a lobby with the provided Id exists
        if (req.params["id"] === "99999") {
            res.status(200).send({
                id: "99999",
                leaderSpotifyId: "88",
                participantUsers: [
                    { spotifyId: "88", spotifyDisplayName: "Adlersson", spotifyProfilePictureUrl: "https://steamuserimages-a.akamaihd.net/ugc/939447311825403335/0C0279F94A44104373CB2807A4BB70B4117EFB9A/" },
                    { spotifyId: "44", spotifyDisplayName: "Inkognito", spotifyProfilePictureUrl: "https://vignette.wikia.nocookie.net/youtube/images/f/f9/Inkognito_Spastiko.jpg/revision/latest?cb=20170225153545&path-prefix=de" }
                ],
                currentSongId: "69",
                currentPlayerPosition: 0,
                queuedSongs: [
                    { spotifyId: "69", queuerId: "44", name: "Mo sicko", artistNames: ["Tracktor Bot", "Drake Bake"], duration: 180, imageUrl: "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/Sicko_Mode_cover.jpg/220px-Sicko_Mode_cover.jpg" },
                    { spotifyId: "420", queuerId: "88", name: "Rainbow", artistNames: ["Mr. Steal-Your-Girl"], duration: 500, imageUrl: "https://images-na.ssl-images-amazon.com/images/I/61yoTtDxuiL._SX425_.jpg" }
                ]
            });
        }
        else {
            res.status(404).send("There is no lobby with the provided Id");
        }
        return [2 /*return*/];
    });
}); });
app.get("/lobbies", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        if (req.query["userId"]) {
            //TODO Check if provided user is in a lobby
            res.send({
                id: "99999",
                leaderSpotifyId: "88",
                participantUsers: [
                    { spotifyId: "88", spotifyDisplayName: "Adlersson", spotifyProfilePictureUrl: "https://steamuserimages-a.akamaihd.net/ugc/939447311825403335/0C0279F94A44104373CB2807A4BB70B4117EFB9A/" },
                    { spotifyId: "44", spotifyDisplayName: "Inkognito", spotifyProfilePictureUrl: "https://vignette.wikia.nocookie.net/youtube/images/f/f9/Inkognito_Spastiko.jpg/revision/latest?cb=20170225153545&path-prefix=de" }
                ],
                currentSongId: "69",
                currentPlayerPosition: 0,
                queuedSongs: [
                    { spotifyId: "69", queuerId: "44", name: "Mo sicko", artistNames: ["Tracktor Bot", "Drake Bake"], duration: 180, imageUrl: "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/Sicko_Mode_cover.jpg/220px-Sicko_Mode_cover.jpg" },
                    { spotifyId: "420", queuerId: "88", name: "Rainbow", artistNames: ["Mr. Steal-Your-Girl"], duration: 500, imageUrl: "https://images-na.ssl-images-amazon.com/images/I/61yoTtDxuiL._SX425_.jpg" }
                ]
            });
        }
        else {
            //TODO Send all Lobbies
            res.status(501).send("Not implemented yet");
        }
        return [2 /*return*/];
    });
}); });
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
app.listen(8080, function () { return console.log("Express is now running!"); });
