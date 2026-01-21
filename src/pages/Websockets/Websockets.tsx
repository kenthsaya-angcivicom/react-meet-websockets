import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BotData from './BotStatus';
import { useRecallWebmStreamPlayer } from '@/hooks/useRecallWebmStreamPlayer';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import { AudioVisualizer } from './AudioVisualizer';

export function Websockets() {

  const [meetBot, setMeetBot] = useState<any>(null);
  const [meetingUrl, setMeetingUrl] = useState<string>('');

  const wsUrl = meetBot?.botId
    ? `ws://localhost:8080/stream?botId=${encodeURIComponent(meetBot.botId)}`
    : null;

  const { prepareAudio, connect, start, stop, clear, isRunning: streamIsRunning, lastWebmUrl, webmChunkCount } =
    useRecallWebmStreamPlayer({ wsUrl, recorderTimesliceMs: 1000 });

  async function healthCheck() {
    console.log('Health Check');
    const response = await fetch(`/api/telehealth/health`);
    console.log('Response', response);
    if (!response.ok) {
      throw new Error(`Failed to check health: ${response.statusText}`);
    }
    return await response.json();
  }

  async function initializeMeetBot() {
    await prepareAudio();

    const response = await fetch(`/api/telehealth/bot`, {
      method: 'POST',
      body: JSON.stringify({
        meetingUrl: 'https://meet.google.com/bmi-gzcx-udt',
        botName: 'Test Bot' + Date.now()
      })
    });
    console.log('Response', response);
    const data = await response.json();
    setMeetBot(data.data);
    console.log('Meet Bot', data);

    const url = `ws://localhost:8080/stream?botId=${encodeURIComponent(data.data.botId)}`;
    connect(url);
  }

  async function clearBot() {
    setMeetBot(null);
    clear();
  }

  useEffect(() => {

    if (!meetBot) return;

    const ws = new WebSocket(
      `ws://localhost:8080/stream?botId=${encodeURIComponent(meetBot.botId)}`
    );

    ws.onopen = () => console.log("stream ws open");
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === "pcm_chunk") {
        console.log('msg', msg);
        // pushPcm16Base64(msg);
      } else {
        console.log("ws msg", msg);
      }
    };
    ws.onerror = (e) => console.log("ws error", e);
    ws.onclose = () => console.log("stream ws closed");

    return () => ws.close();
  }, [meetBot?.botId]);

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-y-auto">
      {/* <p>Bot ID: {botId}</p> */}
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className='px-4 lg:px-6'>
            <h1>Websockets</h1>
            <Button onClick={healthCheck} variant="outline">Health Check</Button>
            <Button onClick={initializeMeetBot} disabled={meetBot || streamIsRunning}>Create Meet Bot</Button>
            <Button onClick={clearBot} disabled={!meetBot} variant="destructive">Clear Bot</Button>
            <div className="grid gap-2">
              <label htmlFor="meetingUrlInput" className="text-sm font-medium">
                Meeting URL
              </label>
              <Input
                id="meetingUrlInput"
                type="text"
                value={meetingUrl || "https://meet.google.com/bmi-gzcx-udt"}
                onChange={(e) => setMeetingUrl(e.target.value)}
              />
            </div>
            <div>
              <Button
                onClick={async () => {
                  try { await start(); } catch (e) { console.error(e); }
                }}
                disabled={!meetBot?.botId || streamIsRunning}
              >
                Start Playback + WebM Encode
              </Button>

              <Button onClick={stop} disabled={!streamIsRunning} variant="outline">
                Stop
              </Button>

              <div style={{ fontSize: 12 }}>
                webm chunks: {webmChunkCount}
                {lastWebmUrl ? (
                  <>
                    {" "}—{" "}
                    <a href={lastWebmUrl} download="recall-stream.webm">
                      download latest webm chunk
                    </a>
                  </>
                ) : null}
              </div>

              {meetBot && <BotData botId={meetBot.id || ''} />}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Websockets