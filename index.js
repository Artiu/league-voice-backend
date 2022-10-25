import { Server } from "socket.io";

const io = new Server();

io.on("connection", (socket) => {
    socket.except(socket.id).emit("userJoined", socket.id);
    socket.on("offer", (offer, to) => {
        socket.to(to).emit("offer", offer);
    });
    socket.on("answer", (answer, to) => {
        socket.to(to).emit("answer", answer);
    });
});
