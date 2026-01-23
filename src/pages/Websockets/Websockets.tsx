import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BotData from './BotStatus';
import { useRecallWebmStreamPlayer } from '@/hooks/useRecallWebmStreamPlayer';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import { AudioVisualizer } from './AudioVisualizer';
import { ArrowUpRightIcon } from 'lucide-react';


export function Websockets() {

  const [meetingUrl, setMeetingUrl] = useState('https://meet.google.com/bmi-gzcx-udt');
  const [meetBot, setMeetBot] = useState<any>(null);

  const wsUrl = meetBot?.botId
    ? `ws://localhost:8080/stream?botId=${encodeURIComponent(meetBot.botId)}`
    : null;

  const ampViz = useAudioVisualizer({
    sampleRate: 16000,
    maxBufferSeconds: 2,
    targetFps: 30,
    debug: false,
  });

  const streamPlayer =
    useRecallWebmStreamPlayer({
      wsUrl,
      recorderTimesliceMs: 1000,
      onPcmFloat32: (pcm) => {
        ampViz.pushFloat32(pcm);
      },
    });

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
    // One-click flow: prepare audio + start visualizer during the user gesture,
    // BEFORE any awaits that might break autoplay permissions.
    await streamPlayer.prepareAudio();

    const response = await fetch(`/api/telehealth/bot`, {
      method: 'POST',
      body: JSON.stringify({
        meetingUrl: 'https://meet.google.com/bmi-gzcx-udt',
        botName: 'Test Bot ' + Date.now()
      })
    });
    console.log('Response', response);
    const data = await response.json();
    setMeetBot(data);
    console.log('Meet Bot', data);

    const url = `ws://localhost:8080/stream?botId=${encodeURIComponent(data.data.id)}`;
    await streamPlayer.start(url);
  }

  async function clearBot() {
    setMeetBot(null);
    streamPlayer.clear();
    ampViz.clear();
  }   

  async function openMeeting() {
    window.open(meetingUrl, '_blank');
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-y-auto">
      {/* <p>Bot ID: {botId}</p> */}
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className='px-4 lg:px-6'>
            <h1>Websockets</h1>
            <Button onClick={healthCheck} variant="outline">Health Check</Button>
            <Button onClick={initializeMeetBot} disabled={meetBot || streamPlayer.isRunning}>Create Meet Bot</Button>
            <Button onClick={clearBot} disabled={!meetBot} variant="destructive">Clear Bot</Button>
            <div className="grid gap-2">
              <label htmlFor="meetingUrlInput" className="text-sm font-medium">
                Meeting URL
              </label>
              <div className="flex flex-row gap-1">
                <Input
                  id="meetingUrlInput"
                  type="text"
                  value={meetingUrl || "https://meet.google.com/bmi-gzcx-udt"}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                />
                <Button 
                onClick={openMeeting}
                variant="ghost"
                disabled={!meetingUrl}

                >
                  <ArrowUpRightIcon className="w-4 h-4" />
                  Open Meeting</Button>
              </div>
            </div>
            <div>
              <Button
                onClick={async () => {
                  try {
                    // If user manually starts, ensure the visualizer is started too.
                    await streamPlayer.start();
                  } catch (e) {
                    console.error(e);
                  }
                }}
                disabled={!meetBot?.botId || streamPlayer.isRunning}
              >
                Start Playback + WebM Encode
              </Button>

              <Button
                onClick={() => {
                  streamPlayer.stop();
                }}
                disabled={!streamPlayer.isRunning}
                variant="outline"
              >
                Stop
              </Button>

              <div style={{ fontSize: 12 }}>
                webm chunks: {streamPlayer.webmChunkCount}
                {streamPlayer.lastWebmUrl ? (
                  <>
                    {" "}—{" "}
                    <a href={streamPlayer.lastWebmUrl} download="recall-stream.webm">
                      download latest webm chunk
                    </a>
                  </>
                ) : null}
              </div>

              {/* Audio Visualizer */}
              {/* {meetBot && ( */}
                <div className="mt-4">
                  <AudioVisualizer canvasRef={ampViz.canvasRef} />
                </div>
              {/* )} */}

              {meetBot && <BotData botId={meetBot.id || ''} />}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Websockets