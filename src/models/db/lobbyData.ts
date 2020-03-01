import { model, Schema, Document } from "mongoose";

export default model("LobbyData", new Schema({
    leaderSpotifyId: { type: String, required: true },
    participantUserIds: { type: [String], required: true },
    currentSongIndex: { type: Number, default: 0 },
    currentPlayerPosition: { type: Number, default: 0 },
    isSongPlaying: { type: Boolean,  default: 0 },
    queuedSongs: [{
        spotifyId: { type: String },
        queuerId: { type: String }
    }]
}, { collection: "lobbies" }));