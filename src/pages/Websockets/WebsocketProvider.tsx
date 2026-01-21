import { createContext, useEffect, useRef, useState } from "react"

export const WebsocketContext = createContext<[boolean, any, (data: string) => void]>([
  false,
  null,
  () => {},
]) // ready, value, send

// Make sure to put WebsocketProvider higher up in
// the component tree than any consumer.
export const WebsocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [isReady, setIsReady] = useState(false)
  const [val, setVal] = useState(null)

  const ws = useRef<WebSocket>(null)

  useEffect(() => {
    const socket = new WebSocket("wss://echo.websocket.events/")

    socket.onopen = () => setIsReady(true)
    socket.onclose = () => setIsReady(false)
    socket.onmessage = (event) => setVal(event.data)

    ws.current = socket

    return () => {
      socket.close()
    }
  }, [])

  const ret = [isReady, val, ws.current?.send.bind(ws.current)]

  return (
    <WebsocketContext.Provider value={ret}>
      {children}
    </WebsocketContext.Provider>
  )
}