import { useEffect, useState } from "react";
import { socket } from "../socket";

function getConnectionState() {
  if (socket.connected) return "connected";
  if (socket.active) return "reconnecting";
  return "disconnected";
}

export default function useSocketConnection() {
  const [connectionState, setConnectionState] = useState(getConnectionState);

  useEffect(() => {
    const handleConnect = () => setConnectionState("connected");
    const handleDisconnect = () => setConnectionState("reconnecting");
    const handleConnectError = () => setConnectionState("reconnecting");

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    setConnectionState(getConnectionState());

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
    };
  }, []);

  return {
    connectionState,
    isConnected: connectionState === "connected",
    isRecovering: connectionState === "reconnecting",
  };
}
