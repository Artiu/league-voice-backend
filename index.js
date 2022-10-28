import { Server } from "socket.io";

const port = process.env.PORT || 3001;
const io = new Server({ cors: { origin: "*" } });

io.on("connection", (socket) => {
    console.log(socket.id + " connected");
    socket.broadcast.emit("userJoined", socket.id);
    socket.on("offer", (offer, to) => {
        socket.to(to).emit("offer", offer, socket.id);
    });
    socket.on("answer", (answer, to) => {
        socket.to(to).emit("answer", answer, socket.id);
    });
    socket.on("iceCandidate", (iceCandidate, to) => {
        socket.to(to).emit("iceCandidate", iceCandidate, socket.id)
    })
});

io.listen(port);
console.log(`Listening on port ${port}`);
