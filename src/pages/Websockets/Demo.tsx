import { Login } from "./Login"
import { useState } from "react"
import { Websockets } from "./Websockets"

export function Demo() {
  const [username, setUsername] = useState("")

  return username ? (
    <Websockets username={username} />
  ) : (
    <Login onSubmit={setUsername} />
  )
}

