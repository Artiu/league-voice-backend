import { Server } from "socket.io";
import { config } from "dotenv";

config();
const port = process.env.PORT || 3001;
const io = new Server({ cors: { origin: "*" } });

io.use((socket, next) => {
    if (!socket.handshake.auth.token) {
        return next(new Error("Not authorized"));
    }
    next();
});

io.on("connection", (socket) => {
    console.log(socket.id + " connected");
    const authData = { id: socket.id, token: socket.handshake.auth.token };
    socket.on("matchStart", (chatId) => {
        socket.join(chatId);
        socket.broadcast.to(chatId).emit("userJoined", authData);
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
