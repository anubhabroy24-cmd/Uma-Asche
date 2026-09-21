# Bugfix Requirements Document: Real-Time Features Not Working Properly Across Web/Network

## Introduction

PujoPlan is a Durga Puja pandal hopping planner with group collaboration features using MongoDB Atlas for storage, Socket.io for real-time communication, Stream.io for video calling, and Firebase authentication. The backend is deployed on Render.com (https://uma-asche.onrender.com) and the frontend on Netlify.

Multiple real-time features are not functioning properly when deployed across the web:
- Member list updates are not appearing immediately when users join groups
- Messages are not being delivered instantly to all group members
- Socket.io connections may not be establishing properly across the internet
- Video calls may not connect between users on different networks
- Production deployment configuration for CORS and Socket.io may be incorrect

This document specifies the bug conditions, expected correct behavior, and preservation requirements to fix these real-time communication issues systematically.

---

## Bug Analysis

### Current Behavior (Defect)

**1.1** WHEN a new user joins a group THEN the member list does not update immediately for other users already viewing that group (requires page refresh to see new member)

**1.2** WHEN a user sends a message in group chat THEN other group members may not receive the message instantly through Socket.io, relying instead on polling fallback

**1.3** WHEN the Socket.io client attempts to connect from a deployed web frontend (Netlify) to the deployed backend (Render.com) THEN the connection may fail or not establish WebSocket transport properly due to CORS or transport configuration issues

**1.4** WHEN Socket.io events are emitted from the server (member_joined, new_message, spots_updated, location_updated) THEN clients may not be listening to these events or may not be joined to the correct room (`group:{groupId}`) to receive them

**1.5** WHEN a user initiates or joins a video call using Stream.io THEN the call may not connect properly between users on different networks due to incorrect Stream.io configuration or missing WebRTC signaling

**1.6** WHEN the backend emits a Socket.io event using `emitGroupUpdate(groupId, eventName, payload)` THEN clients in that group room may not receive the event due to room join failures or connection drops

**1.7** WHEN a user's Socket.io connection drops and reconnects THEN the client may not automatically rejoin the appropriate group rooms, causing missed real-time updates

**1.8** WHEN CORS preflight requests are made from the Netlify frontend to the Render.com backend THEN they may be blocked or misconfigured, preventing Socket.io connections from establishing

**1.9** WHEN Socket.io uses polling transport as fallback THEN the real-time experience degrades because events are delayed compared to WebSocket transport

**1.10** WHEN multiple group members are viewing the same group dashboard simultaneously THEN Socket.io room membership may not be properly maintained, causing some users to miss broadcasts

### Expected Behavior (Correct)

**2.1** WHEN a new user joins a group THEN the member list SHALL update immediately for all other users viewing that group without requiring a page refresh, triggered by the `member_joined` Socket.io event

**2.2** WHEN a user sends a message in group chat THEN all other group members SHALL receive the message instantly via the `new_message` Socket.io event with sub-second latency

**2.3** WHEN the Socket.io client connects from the deployed frontend to the deployed backend THEN the connection SHALL establish successfully using WebSocket transport (not just polling fallback) and maintain a stable connection

**2.4** WHEN Socket.io events are emitted from the server THEN all clients who are members of that group and have active Socket.io connections SHALL receive the events because they are properly joined to the `group:{groupId}` room

**2.5** WHEN a user initiates or joins a video call using Stream.io THEN the call SHALL connect successfully between users on different networks with proper audio and video transmission

**2.6** WHEN the backend emits a Socket.io event using `emitGroupUpdate(groupId, eventName, payload)` THEN all clients in the specified group room SHALL receive the event immediately

**2.7** WHEN a user's Socket.io connection drops and reconnects THEN the client SHALL automatically rejoin all relevant group rooms (stored in `allJoinedGroupIds` set) to resume receiving real-time updates

**2.8** WHEN CORS preflight requests are made from the Netlify frontend to the Render.com backend THEN they SHALL be properly configured to allow Socket.io connections with credentials and appropriate headers

**2.9** WHEN Socket.io establishes a connection THEN it SHALL prefer WebSocket transport over polling for optimal real-time performance with minimal latency

**2.10** WHEN multiple group members view the same group dashboard THEN each SHALL be properly joined to the `group:{groupId}` Socket.io room and receive all broadcast events reliably

### Unchanged Behavior (Regression Prevention)

**3.1** WHEN Socket.io is not available or fails to connect THEN the system SHALL CONTINUE TO use HTTP polling fallback (3-second intervals) to fetch updates, maintaining basic functionality

**3.2** WHEN a user loads the group dashboard for the first time THEN the system SHALL CONTINUE TO fetch the initial group data via REST API (`getGroupById`) before relying on Socket.io for updates

**3.3** WHEN Socket.io authentication middleware runs on the server THEN it SHALL CONTINUE TO allow both authenticated users (with Firebase tokens) and guest users to connect

**3.4** WHEN a user navigates away from a group dashboard THEN the system SHALL CONTINUE TO properly clean up Socket.io event listeners using the unsubscribe function returned by `subscribeToGroupUpdates`

**3.5** WHEN Socket.io connection is established THEN the auto-join feature SHALL CONTINUE TO automatically join users to all groups they are members of based on MongoDB queries

**3.6** WHEN a message is sent via REST API THEN the system SHALL CONTINUE TO save the message to MongoDB and broadcast it via `emitGroupUpdate` to all room members

**3.7** WHEN location updates are shared THEN the system SHALL CONTINUE TO save them to the Presence collection in MongoDB and broadcast via Socket.io `location_updated` events

**3.8** WHEN CORS is configured on the server THEN it SHALL CONTINUE TO allow legitimate origins (including localhost for development and mobile app capacitor:// origins) while maintaining security

**3.9** WHEN group spots are added, removed, or voted on THEN the system SHALL CONTINUE TO emit `spots_updated` events to keep all clients synchronized

**3.10** WHEN a user leaves a group THEN the system SHALL CONTINUE TO emit `member_left` events and properly clean up the user from the group's member list and memberUids array

---

## Bug Condition Derivation

### Bug Condition Function

The bug condition identifies inputs (user actions and network requests) that trigger the real-time communication failures:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type RealTimeAction
  OUTPUT: boolean
  
  // X.action can be: 'join_group', 'send_message', 'connect_socket', 
  //                  'start_video_call', 'emit_event', 'reconnect'
  // X.transport can be: 'websocket', 'polling', 'disconnected'
  // X.roomJoined can be: true, false
  // X.corsConfigured can be: true, false
  // X.networkEnvironment can be: 'production_web', 'localhost', 'mobile'
  
  RETURN (
    (X.action = 'join_group' AND X.realTimeUpdateReceived = false) OR
    (X.action = 'send_message' AND X.instantDelivery = false) OR
    (X.action = 'connect_socket' AND X.transport ≠ 'websocket' AND X.networkEnvironment = 'production_web') OR
    (X.action = 'emit_event' AND X.roomJoined = false) OR
    (X.action = 'start_video_call' AND X.connectionEstablished = false) OR
    (X.action = 'reconnect' AND X.roomsRejoined = false) OR
    (X.corsConfigured = false AND X.networkEnvironment = 'production_web')
  )
END FUNCTION
```

### Example Bug Conditions

**Buggy Input 1:**
```javascript
{
  action: 'join_group',
  groupId: 'grp_123',
  transport: 'websocket',
  roomJoined: true,
  realTimeUpdateReceived: false, // Bug: other members don't see the new member
  networkEnvironment: 'production_web'
}
```

**Buggy Input 2:**
```javascript
{
  action: 'send_message',
  groupId: 'grp_123',
  messageText: 'Hello team!',
  instantDelivery: false, // Bug: message not received via Socket.io
  transport: 'polling',
  networkEnvironment: 'production_web'
}
```

**Buggy Input 3:**
```javascript
{
  action: 'connect_socket',
  backendUrl: 'https://uma-asche.onrender.com',
  frontendUrl: 'https://pujoplan.netlify.app',
  transport: 'polling', // Bug: WebSocket not working, using polling fallback
  corsConfigured: false,
  networkEnvironment: 'production_web'
}
```

**Buggy Input 4:**
```javascript
{
  action: 'start_video_call',
  groupId: 'grp_123',
  callMode: 'video',
  connectionEstablished: false, // Bug: video call fails to connect
  networkEnvironment: 'production_web'
}
```

### Property Specification

**Property: Fix Checking**

For all actions that trigger the bug condition, the fixed system shall provide correct real-time behavior:

```pascal
// Property: Real-Time Member Updates
FOR ALL X WHERE isBugCondition(X) AND X.action = 'join_group' DO
  result ← handleGroupJoin'(X)
  ASSERT (
    result.realTimeUpdateReceived = true AND
    result.memberListUpdated = true AND
    result.latency < 2000ms
  )
END FOR

// Property: Instant Message Delivery
FOR ALL X WHERE isBugCondition(X) AND X.action = 'send_message' DO
  result ← handleMessageSend'(X)
  ASSERT (
    result.instantDelivery = true AND
    result.deliveredViaWebSocket = true AND
    result.latency < 1000ms
  )
END FOR

// Property: WebSocket Connection Establishment
FOR ALL X WHERE isBugCondition(X) AND X.action = 'connect_socket' AND X.networkEnvironment = 'production_web' DO
  result ← establishSocketConnection'(X)
  ASSERT (
    result.transport = 'websocket' AND
    result.connectionEstablished = true AND
    result.corsConfigured = true
  )
END FOR

// Property: Room Join and Event Delivery
FOR ALL X WHERE isBugCondition(X) AND X.action = 'emit_event' DO
  result ← emitGroupUpdate'(X)
  ASSERT (
    result.roomJoined = true AND
    result.eventReceived = true AND
    result.allMembersNotified = true
  )
END FOR

// Property: Video Call Connection
FOR ALL X WHERE isBugCondition(X) AND X.action = 'start_video_call' DO
  result ← establishVideoCall'(X)
  ASSERT (
    result.connectionEstablished = true AND
    result.audioEnabled = true AND
    result.videoEnabled = (X.callMode = 'video')
  )
END FOR

// Property: Reconnection Room Rejoin
FOR ALL X WHERE isBugCondition(X) AND X.action = 'reconnect' DO
  result ← handleReconnect'(X)
  ASSERT (
    result.roomsRejoined = true AND
    result.allGroupRoomsActive = true
  )
END FOR
```

### Preservation Goal

For all actions that do NOT trigger the bug condition (i.e., normal operations that currently work), the system behavior must remain unchanged:

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Where:
- **F**: The original (unfixed) system behavior
- **F'**: The fixed system behavior

This ensures:
- HTTP polling fallback continues to work when WebSocket is unavailable
- REST API initial data loading remains functional
- Authentication and guest access continue to work
- Event listener cleanup continues to prevent memory leaks
- Auto-join functionality for user's groups remains operational
- Message persistence to MongoDB continues
- CORS for localhost and mobile apps remains permissive
- All existing Socket.io event emissions continue broadcasting correctly

---

## Summary

This bugfix specification addresses real-time communication failures in PujoPlan's Socket.io and Stream.io integrations across production web deployments. The bug condition function identifies specific scenarios where real-time features fail (member updates, instant messaging, WebSocket connections, video calls, room joins, and reconnections), while the property specifications define correct behavior for each scenario. The preservation goal ensures that existing functionality (polling fallback, REST APIs, authentication, cleanup, and MongoDB persistence) continues to work without regression.
