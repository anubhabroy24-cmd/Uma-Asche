import React, { useEffect, useState } from 'react';
import {
  CallControls,
  SpeakerLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
} from '@stream-io/video-react-sdk';
import { getStreamCallToken } from '../services/api';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import './StreamCallModal.css';

export default function StreamCallModal({ groupId, groupName, currentUser, callMode, isOpen, onClose }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !groupId || !currentUser) return undefined;

    let cancelled = false;
    let client;
    let call;

    async function startCall() {
      try {
        setError('');
        const { data } = await getStreamCallToken(groupId, `group_${groupId}`);
        if (!data?.token || !data?.apiKey || !data?.userId) {
          throw new Error('Stream call token was not returned.');
        }

        client = new StreamVideoClient({
          apiKey: data.apiKey,
          user: {
            id: data.userId,
            name: data.userName || currentUser.name || 'Group Member',
            image: data.userImage || currentUser.profileImage || undefined,
          },
          token: data.token,
        });
        call = client.call('default', data.callId || `group_${groupId}`);
        await call.join({ create: true });

        if (!cancelled) setSession({ client, call });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to start the Stream call.');
        if (call) await call.leave().catch(() => {});
        if (client) await client.disconnectUser().catch(() => {});
      }
    }

    startCall();

    return () => {
      cancelled = true;
      setSession(null);
      if (call) call.leave().catch(() => {});
      if (client) client.disconnectUser().catch(() => {});
    };
  }, [groupId, currentUser, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="stream-call-modal" role="dialog" aria-modal="true" aria-label={`${callMode || 'video'} call with ${groupName}`}>
      {session ? (
        <StreamVideo client={session.client}>
          <StreamCall call={session.call}>
            <StreamTheme className="stream-call-theme">
              <SpeakerLayout />
              <CallControls onLeave={onClose} />
            </StreamTheme>
          </StreamCall>
        </StreamVideo>
      ) : (
        <div className="stream-call-modal__status">
          {error ? <p>{error}</p> : <><span className="spinner" /><p>Connecting to the group call...</p></>}
          {error && <button className="btn btn-yellow" onClick={onClose}>Close</button>}
        </div>
      )}
    </div>
  );
}
