import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// bot.in_waiting_room, bot.in_call_not_recording, bot.recording_permission_allowed
  // bot.recording_permission_denied, bot.in_call_recording, bot.call_ended
  // bot.done, bot.fatal
type Events = 
    "in_waiting_room" | 
    "in_call_not_recording" | 
    "recording_permission_allowed" | 
    "recording_permission_denied" | 
    "in_call_recording" | 
    "call_ended" | 
    "done" | 
    "fatal";

type BotStatus = {
    status: Events;
    timestamp: number;
}

export default function BotData({botId}: {botId: string}) {

    console.log('BotData: ', botId);

    const { data: botData, isLoading, error } = useQuery<BotStatus>({
        queryKey: ['botStatus', botId],
        queryFn: async () => {  
            console.log('Fetching bot status for botId', botId);
            const response = await fetch(`api/telehealth/bot/${botId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch bot status: ${response.statusText}`);
            }
            const data = await response.json();
            return data?.data;
        },
        enabled: !!botId,
        // refetchInterval: 1000,
    });  



  const renderContent = () => {

    if (isLoading) return <div>Loading Bot Data...</div>;
    if (error) return <div>Error loading Bot Data: {error.message}</div>;

    return (
        <pre>{JSON.stringify(botData, null, 2)}</pre>
    )
  }
  
  return (
    <Card>
        <CardHeader>
            <CardTitle>Bot {botId}</CardTitle>
        </CardHeader>
        <CardContent>
            {renderContent()}
        </CardContent>
    </Card>
  )
}