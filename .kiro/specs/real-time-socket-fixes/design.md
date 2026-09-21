# Real-Time Socket.io Features Bugfix Design

## Overview

This design addresses multiple real-time communication failures in PujoPlan's Socket.io and Stream.io integrations when deployed across production web environments (Netlify frontend + Render.com backend). The issues manifest as delayed or missing member list updates, failed instant message delivery, WebSocket connection problems, and video call connectivity failures.

The root causes span across three areas:
1. **Client-side Socket.io configuration** - connection setup, transport preferences, and reconnection handling
2. **Server-side event emission** - missing or incorrect calls to `emitGroupUpdate()` after database operations
3. **Deployment configuration** - CORS settings, environment variables, and Stream.io WebRTC configuration

The fix strategy follows the bug condition methodology: identify inputs that trigger real-time failures (C(X)), ensure the fixed system provides correct real-time behavior (P(result)), and preserve existing functionality that works (¬C(X)).

## Glossary

- **Bug_Condition (C)**: The condition that triggers real-time communication failures - when Socket.io connections fail to establish WebSocket transport, events are not delivered to group members, or video calls fail to connect
- **Property (P)**: The desired behavior for real-time operations - WebSocket connections establish successfully, events are delivered with sub-second latency, and video calls connect reliably
- **Preservation**: Existing functionality that must remain unchanged - HTTP polling fallback, REST API initial data loading, authentication middleware, event listener cleanup
- **Socket.io Room**: A server-side broadcast channel with format `group:{groupId}` that clients join to receive real-time updates for that group
- **emitGroupUpdate()**: Server helper function in `socketService.js` that broadcasts events to all clients in a group room
- **allJoinedGroupIds**: Client-side Set in `socket.js` that tracks all group rooms the user should be in (persists across reconnections)
- **WebSocket Transport**: Socket.io's preferred real-time protocol offering bidirectional, low-latency communication (vs polling fallback)
- **Stream.io**: Third-party video calling service requiring API key, secret, and user tokens for WebRTC connections
- **CORS**: Cross-Origin Resource Sharing configuration allowing the Netlify frontend to communicate with the Render.com backend

## Bug Details

### Bug Condition

The bugs manifest across six real-time operation categories when deployed in production (Netlify + Render.com):

1. **Member List Updates** - When a user joins a group, other members viewing that group don't see the new member until they refresh the page
2. **Instant Message Delivery** - When a user sends a message, other group members experience delays or don't receive it via Socket.io, relying on 3-second HTTP polling instead
3. **Socket.io Connection** - The client fails to establish WebSocket transport from Netlify to Render.com, falling back to polling or disconnecting entirely
4. **Event Delivery** - Server emits Socket.io events but clients don't receive them because they're not joined to the correct group room
5. **Video Call Connection** - Stream.io video calls fail to connect between users on different networks due to configuration issues
6. **Reconnection Handling** - When Socket.io reconnects after a drop, the client doesn't rejoin group rooms, causing missed updates

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type RealTimeAction
  OUTPUT: boolean
  
  // input.action ∈ {join_group, send_message, connect_socket, start_video_call, emit_event, reconnect}
  // input.transport ∈ {websocket, polling, disconnected}
  // input.roomJoined ∈ {true, false}
  // input.networkEnvironment ∈ {production_web, localhost, mobile}
  
  RETURN (
    // Member updates not appearing
    (input.action = 'join_group' AND input.realTimeUpdateReceived = false) OR
    
    // Messages delayed or missing
    (input.action = 'send_message' AND input.instantDelivery = false) OR
    
    // WebSocket not working in production
    (input.action = 'connect_socket' AND 
     input.transport ≠ 'websocket' AND 
     input.networkEnvironment = 'production_web') OR
    
    // Events not delivered due to room join failures
    (input.action = 'emit_event' AND input.roomJoined = false) OR
    
    // Video calls failing to connect
    (input.action = 'start_video_call' AND input.connectionEstablished = false) OR
    
    // Reconnection not rejoining rooms
    (input.action = 'reconnect' AND input.roomsRejoined = false) OR
    
    // CORS blocking connections
    (input.corsConfigured = false AND input.networkEnvironment = 'production_web')
  )
END FUNCTION
```

### Examples

**Example 1: Member Join Not Appearing**
```javascript
// Buggy Input
{
  action: 'join_group',
  groupId: 'grp_123',
  userId: 'user_456',
  transport: 'websocket',
  roomJoined: true,
  realTimeUpdateReceived: false, // ❌ Bug: other members don't see new member
  networkEnvironment: 'production_web'
}

// Expected: member_joined event received by all group members within 1 second
// Actual: no event received, requires page refresh to see new member
```

**Example 2: Message Not Delivered Instantly**
```javascript
// Buggy Input
{
  action: 'send_message',
  groupId: 'grp_123',
  messageText: 'Hello everyone!',
  instantDelivery: false, // ❌ Bug: message arrives 3+ seconds later via polling
  transport: 'polling',
  networkEnvironment: 'production_web'
}

// Expected: new_message event received within 500ms
// Actual: message appears 3-5 seconds later when polling interval fires
```

**Example 3: WebSocket Connection Failure**
```javascript
// Buggy Input
{
  action: 'connect_socket',
  backendUrl: 'https://uma-asche.onrender.com',
  frontendUrl: 'https://pujoplan.netlify.app',
  transport: 'polling', // ❌ Bug: stuck on polling, WebSocket not working
  corsConfigured: false,
  networkEnvironment: 'production_web'
}

// Expected: Socket.io establishes WebSocket transport successfully
// Actual: Only polling transport works, WebSocket upgrades fail or timeout
```

**Example 4: Video Call Connection Failure**
```javascript
// Buggy Input
{
  action: 'start_video_call',
  groupId: 'grp_123',
  callMode: 'video',
  streamApiKey: 'bazavn2fpwsf',
  connectionEstablished: false, // ❌ Bug: call fails to connect
  networkEnvironment: 'production_web'
}

// Expected: Stream.io establishes WebRTC connection with audio and video
// Actual: Call fails with timeout or connection error
```

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- HTTP polling fallback (3-second intervals) must continue to work when WebSocket is unavailable or fails
- REST API initial data loading via `getGroupById()` must remain functional
- Socket.io authentication middleware allowing both authenticated and guest users must remain unchanged
- Event listener cleanup via unsubscribe functions returned by `subscribeToGroupUpdates()` must continue preventing memory leaks
- Auto-join functionality that automatically joins users to all their groups on connection must remain operational
- Message persistence to MongoDB before broadcasting via Socket.io must continue
- CORS configuration for localhost development and mobile app capacitor:// origins must remain permissive
- All existing Socket.io event types (`member_joined`, `member_left`, `spots_updated`, `new_message`, `location_updated`, `call_signal`, `group_deleted`) must continue broadcasting

**Scope:**
All operations that do NOT involve real-time Socket.io communication failures in production should be completely unaffected. This includes:
- Local development functionality (localhost connections)
- Mobile app functionality (Capacitor-based connections)
- REST API operations that don't depend on Socket.io
- Database operations (MongoDB reads/writes)
- Firebase authentication flows
- Static file serving and routing

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

### 1. Socket.io Client Configuration Issues

**Problem:** The client in `pujoplan/client/src/services/socket.js` may not be optimizing WebSocket transport priority or handling reconnections properly.

**Evidence:**
- Current transport configuration: `transports: ['websocket', 'polling']` should prioritize WebSocket but may not enforce it
- Reconnection logic exists but may not reliably rejoin group rooms if `allJoinedGroupIds` is not properly maintained
- No explicit `upgrade: true` or `pingTimeout` settings to handle network latency

**Impact:** Clients fall back to polling transport, causing 3+ second delays instead of sub-second WebSocket delivery

### 2. Missing or Incomplete Event Emissions

**Problem:** Server-side controllers may not be calling `emitGroupUpdate()` after all database operations, or may be calling it before the operation completes.

**Evidence in `groupController.js`:**
- `joinGroup()` calls `emitGroupUpdate(group.id, 'member_joined', {...})` ✅ Present
- `removeMember()` calls `emitGroupUpdate(id, 'member_left', {...})` ✅ Present
- `sendGroupMessage()` calls `emitGroupUpdate(id, 'new_message', message)` ✅ Present
- `addSpot()`, `removeSpot()`, `voteSpot()`, `finalizeSpot()` all call `emitGroupUpdate(id, 'spots_updated', {...})` ✅ Present
- `updateMemberLocation()` calls `emitGroupUpdate(id, 'location_updated', presence)` ✅ Present

**Potential Issue:** Events are being emitted, but clients may not be receiving them due to room join failures (see #3)

### 3. Room Join Failures on Client Side

**Problem:** Clients may not be properly joined to `group:{groupId}` rooms, causing them to miss broadcasts.

**Evidence:**
- Auto-join on connection queries MongoDB for user's groups and joins rooms server-side ✅
- Client calls `socket.emit('join_group', groupId)` when subscribing ✅
- However, if the connection is established before authentication completes, the auto-join query may return empty results
- Reconnection handler emits `join_groups` with `allJoinedGroupIds`, but only if the set is populated ✅

**Potential Issue:** Race condition between Socket.io connection and Firebase token availability could cause auto-join to fail

### 4. CORS Configuration May Block Socket.io Upgrades

**Problem:** CORS settings in `server.js` may not properly allow Socket.io WebSocket upgrades from Netlify.

**Current Configuration:**
```javascript
origin: function (origin, callback) {
  if (!origin) return callback(null, true);
  if (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('capacitor://') ||
    origin.startsWith('ionic://') ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('https://localhost') ||
    process.env.NODE_ENV !== 'production'
  ) {
    return callback(null, true);
  }
  return callback(null, true); // Always permissive
}
```

**Issue:** The configuration is already fully permissive (`callback(null, true)` at the end), so CORS should not be blocking. However, the Netlify production URL may not be in `ALLOWED_ORIGINS` or `CLIENT_URL` environment variable.

### 5. Stream.io Configuration Missing or Incorrect

**Problem:** Stream.io API key/secret may be using defaults or test credentials that don't work in production.

**Evidence in `callController.js`:**
```javascript
const STREAM_API_KEY = process.env.STREAM_API_KEY || 'bazavn2fpwsf';
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || 'y5wbvp69z4m25cvbyz2zvyc3wtjxp3rgya5w5j46k62xds58y3q5u5sbqsz4cqpy';
```

**Issue:** Using hardcoded defaults suggests production environment variables may not be set on Render.com. Stream.io also requires proper TURN/STUN servers for WebRTC connections across different networks.

### 6. Environment Variable Mismatch

**Problem:** The client is configured to connect to `https://uma-asche.onrender.com` but the server's `CLIENT_URL` may not include the Netlify URL for CORS allowlist.

**Evidence:**
- Client `.env`: `VITE_API_URL=https://uma-asche.onrender.com/api` ✅
- Server `ALLOWED_ORIGINS` includes `CLIENT_URL` but may default to `http://localhost:5173`
- Netlify production URL (e.g., `https://pujoplan.netlify.app`) may not be in the allowlist

**Impact:** Even though CORS is permissive, the Socket.io CORS configuration in `socketService.js` may have different rules

## Correctness Properties

Property 1: Bug Condition - Real-Time Member List Updates

_For any_ user action where a new member joins a group (action = 'join_group'), the fixed system SHALL emit a `member_joined` Socket.io event that is received by all other group members within 1 second, triggering their UI to update the member list without requiring a page refresh.

**Validates: Requirements 2.1, 2.4, 2.6**

Property 2: Bug Condition - Instant Message Delivery

_For any_ message sent by a user (action = 'send_message'), the fixed system SHALL deliver the message to all other group members via Socket.io with sub-second latency (< 1000ms), using WebSocket transport instead of relying on HTTP polling fallback.

**Validates: Requirements 2.2, 2.3, 2.9**

Property 3: Bug Condition - WebSocket Connection Establishment

_For any_ Socket.io connection attempt from the production frontend (Netlify) to the production backend (Render.com) in a cross-network environment, the fixed system SHALL successfully establish a WebSocket transport connection (not just polling fallback) with proper CORS configuration.

**Validates: Requirements 2.3, 2.8, 2.9**

Property 4: Bug Condition - Event Delivery via Room Join

_For any_ Socket.io event emitted by the server using `emitGroupUpdate(groupId, eventName, payload)`, the fixed system SHALL ensure that all clients who are members of that group and have active connections are properly joined to the `group:{groupId}` room and receive the event.

**Validates: Requirements 2.4, 2.6, 2.10**

Property 5: Bug Condition - Video Call Connection

_For any_ video call initiated between users on different networks using Stream.io, the fixed system SHALL establish a WebRTC connection with audio and video transmission, using proper Stream.io API credentials and TURN/STUN server configuration.

**Validates: Requirements 2.5**

Property 6: Bug Condition - Reconnection Room Rejoin

_For any_ Socket.io reconnection after a connection drop, the fixed system SHALL automatically rejoin all group rooms that the user was previously in (stored in `allJoinedGroupIds` set), ensuring they continue to receive real-time updates without manual re-subscription.

**Validates: Requirements 2.7**

Property 7: Preservation - HTTP Polling Fallback

_For any_ scenario where WebSocket transport is unavailable or fails to connect, the fixed system SHALL preserve the existing HTTP polling fallback mechanism (3-second intervals) that fetches updates via REST API, maintaining basic functionality.

**Validates: Requirements 3.1**

Property 8: Preservation - REST API Initial Loading

_For any_ group dashboard load, the fixed system SHALL preserve the existing behavior of fetching initial group data via REST API (`getGroupById()`) before subscribing to Socket.io real-time updates, ensuring the page loads even if Socket.io is unavailable.

**Validates: Requirements 3.2**

Property 9: Preservation - Authentication and Cleanup

_For any_ Socket.io connection, the fixed system SHALL preserve existing authentication middleware (allowing both Firebase-authenticated and guest users) and event listener cleanup behavior (unsubscribe functions preventing memory leaks).

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, we need changes across client, server, and deployment configuration:

#### File 1: `pujoplan/client/src/services/socket.js`

**Function**: `getSocket()` - Socket.io client initialization

**Specific Changes**:

1. **Enforce WebSocket-First Transport**: Add transport upgrade preferences to prioritize WebSocket
   ```javascript
   socket = io(BACKEND_URL, {
     auth: { token },
     transports: ['websocket', 'polling'], // Try WebSocket first
     upgrade: true, // Allow transport upgrades
     rememberUpgrade: true, // Remember successful WebSocket upgrade
     forceNew: false, // Reuse existing connection
     autoConnect: true,
     reconnection: true,
     reconnectionAttempts: 10,
     reconnectionDelay: 1000,
     reconnectionDelayMax: 5000,
     timeout: 20000, // Connection timeout
     pingTimeout: 60000, // Server ping timeout
     pingInterval: 25000, // Ping interval to keep connection alive
   });
   ```

2. **Improve Reconnection Room Rejoin Logic**: Ensure rooms are always rejoined on reconnect
   ```javascript
   socket.on('connect', () => {
     console.log('[Socket] ⚡ Connected:', socket.id, 'Transport:', socket.io.engine.transport.name);
     
     // Log successful WebSocket upgrade
     socket.io.engine.on('upgrade', (transport) => {
       console.log('[Socket] ⬆️ Upgraded to:', transport.name);
     });
     
     // Always rejoin rooms on reconnect
     if (allJoinedGroupIds.size > 0) {
       const roomsArray = Array.from(allJoinedGroupIds);
       console.log('[Socket] 🔄 Rejoining', roomsArray.length, 'rooms after reconnect');
       socket.emit('join_groups', roomsArray);
     } else if (currentGroupId) {
       console.log('[Socket] 🔄 Rejoining room:', currentGroupId);
       socket.emit('join_group', currentGroupId);
     }
   });
   ```

3. **Add Transport Monitoring**: Log transport changes for debugging
   ```javascript
   socket.io.engine.on('upgrade', (transport) => {
     console.log('[Socket] ⬆️ Transport upgraded to:', transport.name);
   });
   
   socket.io.engine.on('close', (reason) => {
     console.warn('[Socket] 🔌 Transport closed:', reason);
   });
   ```

4. **Ensure Token is Available Before Connecting**: Add token refresh mechanism
   ```javascript
   export function updateSocketAuthToken(token) {
     if (socket) {
       socket.auth = { token };
       // Disconnect and reconnect with new token
       if (socket.connected) {
         socket.disconnect();
       }
       socket.connect();
     }
   }
   ```

#### File 2: `pujoplan/server/services/socketService.js`

**Function**: `initSocket()` - Socket.io server initialization

**Specific Changes**:

1. **Improve CORS Configuration for Production**: Explicitly allow Netlify origin
   ```javascript
   io = new Server(server, {
     cors: {
       origin: (origin, callback) => {
         // Allow all origins for Socket.io (already handled by Express CORS)
         // Explicitly allow Netlify and Render domains
         const allowedOrigins = [
           'https://pujoplan.netlify.app',
           'https://uma-asche.onrender.com',
           'http://localhost:5173',
           'http://localhost:3000',
           'capacitor://localhost',
           'ionic://localhost',
         ];
         
         if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
           return callback(null, true);
         }
         
         // Be permissive for mobile and development
         if (origin.startsWith('capacitor://') || 
             origin.startsWith('ionic://') || 
             origin.startsWith('http://localhost') ||
             origin.startsWith('https://localhost')) {
           return callback(null, true);
         }
         
         // Allow all in development
         if (process.env.NODE_ENV !== 'production') {
           return callback(null, true);
         }
         
         callback(null, true); // Permissive fallback
       },
       methods: ['GET', 'POST'],
       credentials: true,
       allowedHeaders: ['Content-Type', 'Authorization'],
     },
     transports: ['websocket', 'polling'],
     allowEIO3: true,
     pingTimeout: 60000,
     pingInterval: 25000,
     upgradeTimeout: 30000,
     maxHttpBufferSize: 1e6,
   });
   ```

2. **Add Logging for Room Joins**: Track when clients join/leave rooms
   ```javascript
   socket.on('join_group', (groupId) => {
     if (groupId) {
       const room = `group:${groupId}`;
       socket.join(room);
       console.log(`[Socket] 🚪 ${user.name || user.uid} joined room: ${room} (socket: ${socket.id})`);
       
       // Confirm room join by checking socket rooms
       const rooms = Array.from(socket.rooms);
       console.log(`[Socket] 📋 Active rooms for ${socket.id}:`, rooms);
     }
   });
   ```

3. **Add Logging for Event Emissions**: Track when events are broadcast
   ```javascript
   function emitGroupUpdate(groupId, eventName, payload) {
     if (io && groupId) {
       const room = `group:${groupId}`;
       const socketsInRoom = io.sockets.adapter.rooms.get(room);
       const clientCount = socketsInRoom ? socketsInRoom.size : 0;
       
       console.log(`[Socket] 📤 Emitting '${eventName}' to room '${room}' (${clientCount} clients)`);
       io.to(room).emit(eventName, payload);
       
       if (clientCount === 0) {
         console.warn(`[Socket] ⚠️ No clients in room '${room}' to receive '${eventName}'`);
       }
     } else {
       console.warn(`[Socket] ⚠️ Cannot emit '${eventName}': io=${!!io}, groupId=${groupId}`);
     }
   }
   ```

#### File 3: `pujoplan/server/server.js`

**Function**: CORS and Express configuration

**Specific Changes**:

1. **Add Netlify URL to ALLOWED_ORIGINS**: Ensure production frontend is explicitly allowed
   ```javascript
   const ALLOWED_ORIGINS = [
     CLIENT_URL,
     'https://pujoplan.netlify.app', // Production frontend
     'https://uma-asche.onrender.com', // Production backend
     'http://localhost:5173',
     'http://127.0.0.1:5173',
     'http://localhost',
     'https://localhost',
     'capacitor://localhost',
     'ionic://localhost',
   ];
   ```

2. **Add Environment Variable Validation**: Log configuration on startup
   ```javascript
   server.listen(PORT, () => {
     console.log(`\n🪔  PujoPlan API + Socket.io Server →  http://localhost:${PORT}/api`);
     console.log(`    Database                         →  MongoDB Atlas`);
     console.log(`    Frontend (CLIENT_URL)            →  ${CLIENT_URL}`);
     console.log(`    Environment                      →  ${process.env.NODE_ENV || 'development'}`);
     console.log(`    CORS Origins Allowed             →  ${ALLOWED_ORIGINS.join(', ')}`);
     console.log(`    Socket.io Transports             →  websocket, polling\n`);
   });
   ```

#### File 4: `pujoplan/server/controllers/callController.js`

**Function**: `generateStreamToken()` - Stream.io token generation

**Specific Changes**:

1. **Add Environment Variable Validation**: Warn if using default credentials
   ```javascript
   const STREAM_API_KEY = process.env.STREAM_API_KEY || 'bazavn2fpwsf';
   const STREAM_API_SECRET = process.env.STREAM_API_SECRET || 'y5wbvp69z4m25cvbyz2zvyc3wtjxp3rgya5w5j46k62xds58y3q5u5sbqsz4cqpy';

   if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
     console.warn('[Stream] ⚠️ Using default Stream.io credentials - set STREAM_API_KEY and STREAM_API_SECRET for production');
   }
   ```

2. **Add Error Handling for Stream.io Operations**: Catch and log failures
   ```javascript
   try {
     const call = client.video.call('default', targetCallId);
     const response = await call.getOrCreate({
       data: {
         created_by_id: userId,
         custom: { groupId: groupId || '' },
         settings_override: {
           audio: { mic_default_on: true },
           video: { camera_default_on: true },
         },
       },
     });
     console.log('[Stream] ✅ Call created/retrieved:', targetCallId);
   } catch (e) {
     console.error('[Stream] ❌ call.getOrCreate failed:', e.message, e.code);
     // Continue anyway - client can still attempt to join
   }
   ```

#### File 5: Deployment Configuration (Render.com Environment Variables)

**Changes**: Add/verify environment variables on Render.com dashboard

**Required Environment Variables**:
```
NODE_ENV=production
PORT=5000
CLIENT_URL=https://pujoplan.netlify.app
MONGODB_URI=<your_mongodb_atlas_connection_string>
FIREBASE_PROJECT_ID=<your_firebase_project_id>
FIREBASE_PRIVATE_KEY=<your_firebase_private_key>
FIREBASE_CLIENT_EMAIL=<your_firebase_client_email>
STREAM_API_KEY=<your_stream_io_api_key>
STREAM_API_SECRET=<your_stream_io_secret>
```

**Verification**: After setting, restart the Render.com service and check logs for:
- `Frontend (CLIENT_URL) → https://pujoplan.netlify.app`
- `CORS Origins Allowed → ...https://pujoplan.netlify.app...`
- No warning about default Stream.io credentials

#### File 6: Deployment Configuration (Netlify Environment Variables)

**Changes**: Verify Netlify environment variables

**Required Environment Variables**:
```
VITE_API_URL=https://uma-asche.onrender.com/api
VITE_GEMINI_API_KEY=<your_gemini_api_key>
```

**Note**: These appear to be already set correctly in `pujoplan/client/.env`

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code in production, then verify the fixes work correctly and preserve existing behavior. Testing will be conducted across three environments: localhost development, production Netlify/Render deployment, and mobile app deployment.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the real-time communication bugs BEFORE implementing the fixes. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Deploy the UNFIXED code to a test environment (or use current production) and manually test each bug condition with browser DevTools Network tab open and server logs visible. Document the exact failures and their causes.

**Test Cases**:

1. **WebSocket Transport Test** (will fail on unfixed code)
   - Open Netlify production app in browser DevTools
   - Navigate to Network → WS (WebSocket) tab
   - Observe Socket.io connection messages
   - **Expected Counterexample**: Connection uses "polling" transport only, no WebSocket upgrade occurs
   - **Root Cause Confirmation**: Check for CORS errors, WebSocket timeout errors, or "transport error" messages

2. **Member Join Real-Time Update Test** (will fail on unfixed code)
   - User A: Open group dashboard in browser, keep DevTools Console open
   - User B: Join the same group from a different browser/device
   - User A: Observe if member list updates without refreshing
   - **Expected Counterexample**: User A does not see User B join until page refresh
   - **Root Cause Confirmation**: Check User A's console for `member_joined` event receipt (should be missing or delayed by 3+ seconds)

3. **Message Instant Delivery Test** (will fail on unfixed code)
   - User A: Open group chat, send a message, note timestamp
   - User B: Open same group chat, observe when message appears
   - Measure latency using DevTools timestamps
   - **Expected Counterexample**: Message arrives 3-5 seconds later (polling interval) instead of sub-second
   - **Root Cause Confirmation**: Check Network tab for polling requests instead of WebSocket frames

4. **Room Join Verification Test** (will fail on unfixed code)
   - User A: Connect to Socket.io and join a group
   - Server: Check logs for room join confirmation
   - Server: Use `io.sockets.adapter.rooms.get('group:grp_123')` to verify client is in room
   - **Expected Counterexample**: Client socket ID is not in the room set, or auto-join query returns empty
   - **Root Cause Confirmation**: Authentication token arrives after auto-join query executes (race condition)

5. **Video Call Connection Test** (will fail on unfixed code)
   - User A: Start a video call in a group
   - User B: Accept the call from a different network
   - Observe connection status and errors
   - **Expected Counterexample**: Call fails with "Connection timeout" or "Unable to establish connection"
   - **Root Cause Confirmation**: Missing TURN/STUN servers, invalid Stream.io credentials, or WebRTC negotiation failure

6. **Reconnection Room Rejoin Test** (will fail on unfixed code)
   - User A: Join a group, then simulate connection drop (airplane mode for 10 seconds)
   - User A: Re-enable connection and observe reconnection behavior
   - User B: Send a message while User A is reconnecting
   - **Expected Counterexample**: User A does not see User B's message after reconnecting (missed due to not rejoining room)
   - **Root Cause Confirmation**: Check console logs for reconnect event but no subsequent `join_groups` emission

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system produces the expected real-time behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem.handleRealTimeAction(input)
  ASSERT expectedBehavior(result)
END FOR

FUNCTION expectedBehavior(result)
  RETURN (
    // WebSocket transport established
    (result.transport = 'websocket') AND
    
    // Events delivered with low latency
    (result.latency < 1000ms) AND
    
    // Member updates appear instantly
    (result.realTimeUpdateReceived = true) AND
    
    // Messages delivered instantly
    (result.instantDelivery = true) AND
    
    // Clients joined to correct rooms
    (result.roomJoined = true) AND
    
    // Video calls connect successfully
    (result.connectionEstablished = true) AND
    
    // Reconnections rejoin rooms
    (result.roomsRejoined = true)
  )
END FUNCTION
```

**Test Cases** (after fixes applied):

1. **WebSocket Transport Verification**
   - Connect from Netlify production frontend
   - Check DevTools Network → WS tab for WebSocket connection
   - Assert: Socket.io uses "websocket" transport, not "polling"
   - Assert: Console logs show "Transport: websocket" and "Upgraded to: websocket"

2. **Member Join Real-Time Verification**
   - User A: Open group dashboard with DevTools Console
   - User B: Join group from different browser
   - Assert: User A sees `member_joined` event in console within 1 second
   - Assert: User A's member list updates without page refresh
   - Assert: Server logs show "Emitting 'member_joined' to room 'group:grp_123' (N clients)"

3. **Message Instant Delivery Verification**
   - User A: Send message with DevTools Performance tab recording
   - User B: Observe message receipt with DevTools
   - Assert: Message latency < 1000ms (use Performance timeline)
   - Assert: Message arrives via WebSocket frame, not HTTP polling request

4. **Room Join Verification**
   - User connects and joins group
   - Server logs show room join confirmation with socket ID
   - Assert: `io.sockets.adapter.rooms.get('group:grp_123').has(socket.id)` returns true
   - Assert: Server logs show "Active rooms for {socketId}: [socket.id, group:grp_123]"

5. **Video Call Connection Verification**
   - User A: Start video call
   - User B: Accept call from different network
   - Assert: WebRTC connection establishes within 10 seconds
   - Assert: Audio and video streams are transmitted
   - Assert: No "Connection timeout" or TURN/STUN errors

6. **Reconnection Room Rejoin Verification**
   - User A: Join group, then disconnect (airplane mode)
   - User A: Reconnect after 10 seconds
   - Assert: Console shows "Rejoining N rooms after reconnect"
   - User B: Send message immediately after User A reconnects
   - Assert: User A receives the message (proves room rejoin worked)

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system produces the same result as the original system.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: For each preserved behavior, first observe and document the behavior on UNFIXED code in a working scenario (e.g., localhost), then verify the FIXED code maintains identical behavior.

**Test Cases**:

1. **HTTP Polling Fallback Preservation**
   - Observe on UNFIXED code: Disable WebSocket in browser (DevTools → Network conditions → disable WebSocket)
   - Assert: System falls back to HTTP polling (3-second intervals) and continues to function
   - Apply fixes and repeat test
   - Assert: Polling fallback still works identically (same polling interval, same endpoints)

2. **REST API Initial Loading Preservation**
   - Observe on UNFIXED code: Load group dashboard, check Network tab for initial `GET /api/groups/:id` request
   - Assert: Initial data loads via REST API before Socket.io subscription
   - Apply fixes and repeat test
   - Assert: Same REST API request occurs with identical timing and payload

3. **Authentication Middleware Preservation**
   - Observe on UNFIXED code: Connect with valid Firebase token, then connect without token (guest)
   - Assert: Both connections succeed, guests get `uid: 'guest_{socketId}'`
   - Apply fixes and repeat test
   - Assert: Authentication behavior unchanged (same logic, same guest ID format)

4. **Event Listener Cleanup Preservation**
   - Observe on UNFIXED code: Subscribe to group updates, then navigate away and check for memory leaks
   - Assert: Unsubscribe function removes all event listeners
   - Apply fixes and repeat test
   - Assert: Cleanup behavior unchanged (same listeners removed, no memory leaks)

5. **Auto-Join Functionality Preservation**
   - Observe on UNFIXED code: User with 3 groups connects to Socket.io
   - Assert: Server auto-joins user to all 3 group rooms based on MongoDB query
   - Apply fixes and repeat test
   - Assert: Auto-join behavior unchanged (same MongoDB query, same rooms joined)

6. **Message MongoDB Persistence Preservation**
   - Observe on UNFIXED code: Send message via REST API, check MongoDB for saved document
   - Assert: Message is saved to MongoDB before Socket.io broadcast
   - Apply fixes and repeat test
   - Assert: Persistence behavior unchanged (same MongoDB document structure and timing)

7. **CORS Localhost Preservation**
   - Observe on UNFIXED code: Run client on `http://localhost:5173` and connect to server
   - Assert: CORS allows localhost connections for development
   - Apply fixes and repeat test
   - Assert: Localhost development continues to work identically

8. **Mobile App CORS Preservation**
   - Observe on UNFIXED code: Run Capacitor mobile app and connect to server
   - Assert: CORS allows `capacitor://localhost` origin
   - Apply fixes and repeat test
   - Assert: Mobile app connections continue to work identically

### Unit Tests

- Test Socket.io client initialization with various configurations (token present/absent, network conditions)
- Test room join/leave operations on both client and server
- Test event emission and receipt for each event type (`member_joined`, `new_message`, `spots_updated`, etc.)
- Test reconnection logic with simulated network drops
- Test CORS configuration with various origin headers
- Test Stream.io token generation with valid/invalid credentials
- Test authentication middleware with valid tokens, expired tokens, and no tokens

### Property-Based Tests

- Generate random Socket.io connection scenarios (different network conditions, token states, room memberships) and verify WebSocket transport is always attempted first
- Generate random group membership configurations and verify auto-join correctly identifies all user's groups
- Generate random message send operations and verify all events are emitted to the correct rooms with the correct payloads
- Generate random reconnection scenarios (different numbers of joined rooms) and verify all rooms are rejoined
- Generate random CORS origin headers and verify legitimate origins are always allowed

### Integration Tests

- **End-to-End Member Join Flow**: User creates group → shares invite → second user joins → first user sees member appear instantly
- **End-to-End Message Flow**: User A sends message → User B receives via WebSocket → message appears in UI within 1 second
- **End-to-End Video Call Flow**: User A starts call → Stream.io generates token → User B joins → WebRTC connection establishes → audio/video transmitted
- **Cross-Network Testing**: Deploy to production (Netlify + Render) and test from multiple networks (home WiFi, mobile data, public WiFi) to verify WebSocket and WebRTC work across NATs
- **Connection Resilience Testing**: Simulate network drops, reconnections, and server restarts to verify room rejoining and event delivery recovery
