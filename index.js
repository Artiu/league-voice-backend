import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { config } from "dotenv";
import { getCurrentMatchBySummonerId, getSummonerByName } from "./riotApi.js";
import { RateLimiterMemory } from "rate-limiter-flexible";
import helmet from "helmet";

config();
const port = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);

const authRateLimiter = new RateLimiterMemory({
    points: 5,
    duration: 60,
});

const matchStartRateLimiter = new RateLimiterMemory({
    points: 1,
    duration: 1,
});

const releaseAppInfo = {
    url: "https://api.league-voice.site/releases/LeagueVoice.zip",
    version: "0.4.1",
    notes: "Only one app can be opened",
    signature:
        "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRS0ViL2tKVmwwYlJDcmMwdkFmZHU0T3pVTlhSdHpxc3R2WDJTN2p1akRzRm5tRkNZcGUxaDJoOWw4NkVMcHYzVTlJTTFpcFBtVzMxNWg1NWR5d1NUczdNb3BFTFFKQUFZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNjcxMjM5NjU0CWZpbGU6TGVhZ3VlIFZvaWNlXzAuNC4xX3g2NF9lbi1VUy5tc2kuemlwCk5OWHJsQlpBR0VpdWtiNFIvREFjOFd6VmxCZEw2dFkyQllSRkFRZVFHazNmVVQ1anhlcituMXg1Qk1jUjNMUXhhWHpWQXRnMjJVRm5heWVMNWxRc0J3PT0K",
};

app.use(helmet());
app.disable("x-powered-by");

app.use("/releases", express.static("releases"));

app.get("/releases/:version", (req, res) => {
    if (req.params.version === releaseAppInfo.version) {
        return res.sendStatus(204);
    }
    res.status(200).json(releaseAppInfo);
});

const io = new Server(httpServer, {
    cors: {
        origin: ["http://localhost:1420", "https://tauri.localhost", "https://league-voice.site"],
    },
});

io.use(async (socket, next) => {
    try {
        await authRateLimiter.consume(socket.handshake.address);
    } catch {
        console.log(
            `Ip address: ${socket.handshake.address} tried to log in more than 5 times in minute`
        );
        return next(new Error("rate-limit"));
    }
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
        try {
            await matchStartRateLimiter.consume(socket.id);
        } catch {
            return;
        }
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
    socket.on("signaling", async (data, to) => {
        let isInTheSameMatch = false;
        socket.rooms.forEach((roomId) => {
            if (roomId === socket.id) return;
            isInTheSameMatch = io.sockets.sockets.get(to)?.rooms.has(roomId);
        });
        if (!isInTheSameMatch) return;
        socket.to(to).emit("signaling", data, authData);
    });
});

httpServer.listen(port);
console.log(`Listening on port ${port}`);
