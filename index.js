import { Server } from "socket.io";
import { config } from "dotenv";
import { getCurrentMatchBySummonerId, getSummonerByName } from "./riotApi.js";

config();
const port = process.env.PORT || 3001;
const io = new Server({
    cors: { origin: ["http://localhost:1420", "https://tauri.localhost"], credentials: true },
});

io.use(async (socket, next) => {
    if (!socket.handshake.auth.summonerName) {
        return next(new Error("Not authorized!"));
    }
    const summonerData = await getSummonerByName(socket.handshake.auth.summonerName);
    if (!summonerData) {
        return next(new Error("Not authorized!"));
    }
    socket.summoner = summonerData;
    next();
});

io.on("connection", (socket) => {
    console.log(`${socket.id}(${socket.summoner.name}) connected`);
    const authData = { id: socket.id, summonerName: socket.summoner.name };
    socket.on("matchStart", async () => {
        socket.rooms.forEach((value) => {
            if (value !== socket.id) {
                socket.rooms.delete(value);
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
    socket.on("offer", (offer, to) => {
        socket.to(to).emit("offer", offer, authData);
    });
    socket.on("answer", (answer, to) => {
        socket.to(to).emit("answer", answer, socket.id);
    });
    socket.on("iceCandidate", (iceCandidate, to) => {
        socket.to(to).emit("iceCandidate", iceCandidate, socket.id);
    });
});

io.listen(port);
console.log(`Listening on port ${port}`);
