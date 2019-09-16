import { model, Schema } from "mongoose";

export default model("LobbyData", new Schema({
    leaderSpotifyId: { type: String, required: true },
    participantUserIds: { type: [String], required: true },
    currentSongSpotifyId: { type: String, default: null },
    currentPlayerPosition: { type: Number, default: 0 },
    queuedSongs: [{
        spotifyId: { type: String },
        queurId: { type: String }
    }]
}, { collection: "lobbies" }));