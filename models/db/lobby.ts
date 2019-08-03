import { model, Schema } from "mongoose";

export default model("lobbies", new Schema({
    leaderSpotifyId: String,
    participantUsers: [{
        spotifyId: String
    }],
    currentSongSpotifyId: String,
    currentPlayerPosition: Number,
    queuedSongs: [{
        spotifyId: String,
        queurId: String
    }]
}));