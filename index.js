import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { config } from "dotenv";
import { getCurrentMatchBySummonerId, getSummonerByName } from "./riotApi.js";

config();
const port = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);

const releaseAppInfo = {
    url: "https://league-voice.site/releases/LeagueVoice.zip",
    version: "0.0.0",
    notes: "First release",
    signature:
        "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRS0ViL2tKVmwwYmZwaXdHbnNKTDVUM0ltN001bVBkU1N3RzlqZTUya1VuQ3JqQytpT2hxOFhIMFQ4N1hhWFlTSXJjdkZsK3lSek5NdkdkS2t5a016eFhHdmFOUjF5ekFJPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNjcwNzI5MDk1CWZpbGU6TGVhZ3VlIFZvaWNlXzAuMC4wX3g2NF9lbi1VUy5tc2kuemlwCklaT2hkZ3lhU2kwWEFXUDJoYnU4T1ZUQXEzMjRvcEtPQWdQSm8zTi9ZQTFkSFBxUzVtM04rVHh3VTNlMGVudCtFdzVpcnhzMlhGdnE5V3l1aCt4U0JnPT0K",
};

app.get("/releases/:version", (req, res) => {
    if (req.params.version === releaseAppInfo.version) {
        return res.status(204);
    }
    res.status(200).json(releaseAppInfo);
});

app.get("/releases", express.static("releases"));

const io = new Server(httpServer, {
    cors: {
        origin: ["http://localhost:1420", "https://tauri.localhost"],
        credentials: true,
    },
});

io.use(async (socket, next) => {
    if (!socket.handshake.auth.summonerName) {
        return next(new Error("unauthorized"));
    }
    const summonerData = await getSummonerByName(socket.handshake.auth.summonerName);
    if (!summonerData) {
        return next(new Error("unauthorized"));
    }
    socket.summoner = summonerData;
    next();
});

io.on("connection", (socket) => {
    console.log(
        `${socket.id}(${socket.summoner.name}) connected\nCurrent user count: ${io.engine.clientsCount}`
    );
    const authData = { id: socket.id, summonerName: socket.summoner.name };
    socket.on("matchStart", async () => {
        socket.rooms.forEach((value) => {
            if (value !== socket.id) {
                socket.leave(value);
            }
        });
        const matchData = await getCurrentMatchBySummonerId(socket.summoner.id);
        if (!matchData) return;
        const summonerTeam = matchData.participants.find(
            (participant) => participant.summonerName === socket.summoner.name
        ).teamId;
        const teammates = matchData.participants.filter(
            (participant) => participant.teamId === summonerTeam
        );
        socket.emit("matchStarted", teammates);
        const roomName = matchData.gameId + "-" + summonerTeam;
        socket.join(roomName);
        console.log(`${socket.summoner.name} joined ${roomName} room`);
        socket.broadcast.to(roomName).emit("userJoined", authData);
    });
    socket.on("signaling", (data, to) => {
        socket.to(to).emit("signaling", data, authData);
    });
});

httpServer.listen(port);
console.log(`Listening on port ${port}`);
