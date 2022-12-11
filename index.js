import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { config } from "dotenv";
import cors from "cors";
import { getCurrentMatchBySummonerId, getSummonerByName } from "./riotApi.js";

config();
const port = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);

const releaseAppInfo = {
    url: "https://api.league-voice.site/releases/LeagueVoice.zip",
    version: "0.0.1",
    notes: "Fix problem with connection to the server",
    signature:
        "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRS0ViL2tKVmwwYlhlQ1RPQVJ6ZUtFeWUxb1FGenM1ZXIyZHEvODQ5Yk1rQ0NyNUxSSU4zVnJKTjA2U01nU2twUkJSNWxuQ1JyY2gxOTdHdGhZa0FZZDFpSGlZNzIweVFRPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNjcwNzc0MjcwCWZpbGU6TGVhZ3VlIFZvaWNlXzAuMC4xX3g2NF9lbi1VUy5tc2kuemlwCjlBTXVoWkJZcTJqc2FGNmxXNXNpSDVHajUxWm9OdWpqYXBkOFQ3SVp0WDdyZmNONzdrNm1hZi8vL2wxNXNUOHpKMmZWUzcvczlhYmpWYnJPNDZCSUJnPT0K",
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
