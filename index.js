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
	url: "https://league-voice-api.artiu.dev/releases/LeagueVoice.zip",
	version: "0.5.3",
	notes: "URL Change",
	signature:
		"dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRS0ViL2tKVmwwYlNhRy8xOExxQUhPN1BoMTY4elBLaExIVWVRbTVMc1dvOVJQR3B5dFF6R09KcVdQK08rMW5MRjRqVCtaYXpYRGNoV1hrRVhBUGVhOXByQXZXbDJQTndZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzAwODUyMjA2CWZpbGU6TGVhZ3VlIFZvaWNlXzAuNS4zX3g2NF9lbi1VUy5tc2kuemlwCmFJWXMrUDlkaHNGRDNRMStEblI0Nko2akxxOWdRa1FRUjNtQWVKNms3UW9IeitFTE9WMTNzczY1ajdudGRhTWJmQUVTUGxqUmpjOU9sQ0hHbVNNa0NnPT0K",
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
	const ip = socket.handshake.headers["x-real-ip"];
	try {
		await authRateLimiter.consume(ip);
	} catch {
		console.log(`Ip address: ${ip} tried to log in more than 5 times in minute`);
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
	const leavePreviousCall = () => {
		socket.rooms.forEach((value) => {
			if (value !== socket.id) {
				socket.to(value).emit("userLeft", authData);
				socket.leave(value);
				console.log(`${socket.id}(${socket.summoner.name}) left ${value} room`);
			}
		});
	};
	const onMatchStarted = async () => {
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
		const roomName = matchData.gameId + "-" + summonerTeam;
		if (
			(await io.in(roomName).fetchSockets()).find(
				(socketFromRoom) => socketFromRoom.summoner.name === authData.summonerName
			)
		) {
			socket.emit("matchStarted", { error: "account-currently-in-room" });
			return;
		}
		socket.emit("matchStarted", teammates);
		socket.join(roomName);
		console.log(`${socket.summoner.name} joined ${roomName} room`);
		socket.broadcast.to(roomName).emit("userJoined", authData);
	};

	const onSignaling = (data, to) => {
		let isInTheSameMatch = false;
		socket.rooms.forEach((roomId) => {
			if (roomId === socket.id) return;
			isInTheSameMatch = io.sockets.sockets.get(to)?.rooms.has(roomId);
		});
		if (!isInTheSameMatch) return;
		socket.to(to).emit("signaling", data, authData);
	};

	socket.on("matchStart", onMatchStarted);
	socket.on("signaling", onSignaling);
	socket.on("leaveCall", () => {
		leavePreviousCall();
	});
	socket.on("disconnecting", () => {
		leavePreviousCall();
	});
});

httpServer.listen(port);
console.log(`Listening on port ${port}`);
