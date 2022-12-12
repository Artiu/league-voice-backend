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
    url: "https://api.league-voice.site/releases/LeagueVoice.zip",
    version: "0.2.0",
    notes: "Fix updater",
    signature:
        "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRS0ViL2tKVmwwYlZiYXVyZERWL2RSaDJjL3BoU3o2ZG1JMmxVZEdweTEyYTdxa2VkcUZEYzRPdC9sV0NkUXA2N0pVc1ZYY3BKdEplZmRxRFpqU2lmMUozdGhlR2xXbkFjPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNjcwNzk0NDAyCWZpbGU6TGVhZ3VlIFZvaWNlXzAuMi4wX3g2NF9lbi1VUy5tc2kuemlwClN3UlR4VVBNOXhoWXB4Um9QU09YRkErdGk1dlk1aWlrSWJYaGZLUzIvSmVoWkJvWk1GSzROMXBPWW5EUllMbWIzU1VDRmtScTRpN2s2MG5sWTcrMUNBPT0K",
};

app.use("/releases", express.static("releases"));

app.get("/releases/:version", (req, res) => {
    if (req.params.version === releaseAppInfo.version) {
        return res.sendStatus(204);
    }
    res.status(200).json(releaseAppInfo);
});

const io = new Server(httpServer, {
    cors: { origin: ["http://localhost:1420", "https://tauri.localhost"] },
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
                console.log(`${socket.id}(${socket.summoner.name}) left ${value} room`);
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
        let isInTheSameMatch = false;
        socket.rooms.forEach((roomId) => {
            if (roomId === socket.id) return;
            isInTheSameMatch = io.sockets.sockets.get(to).rooms.has(roomId);
        });
        if (!isInTheSameMatch) return;
        socket.to(to).emit("signaling", data, authData);
    });
});

httpServer.listen(port);
console.log(`Listening on port ${port}`);
