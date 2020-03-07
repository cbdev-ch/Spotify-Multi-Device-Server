import { model, Schema, Document } from "mongoose";

export default model("LobbyData", new Schema({
    leaderSpotifyId: { type: String, required: true },
    participantUserIds: { type: [String], required: true },
    playerId: { type: String, required: true }
}, { collection: "lobbies" }));