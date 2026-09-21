# Implementation Plan: Real-Time Socket.io Features Bugfix

## Overview
This task list implements fixes for real-time communication failures in PujoPlan's Socket.io and Stream.io integrations across production web deployments (Netlify frontend + Render.com backend). The issues include delayed member list updates, failed instant message delivery, WebSocket connection problems, and video call connectivity failures.

---

## Exploration Phase

- [ ] 1. Write bug condition exploration tests (BEFORE implementing fix)
  - **Property 1: Bug Condition** - Real-Time Communication Failures in Production
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior - they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the real-time bugs exist in production deployment
  - **Testing Approach**: Manual testing with browser DevTools and server logs to document exact failures
  
  - [ ] 1.1 Test WebSocket transport establishment
    - Deploy UNFIXED code to test environment (or use current production)
    - Open Netlify production app in browser DevTools
    - Navigate to Network → WS (WebSocket) tab
    - Observe Socket.io connection messages and transport type
    - **Expected Counterexample**: Connection uses "polling" transport only, no WebSocket upgrade occurs
    - Document exact error messages (CORS errors, WebSocket timeout, transport errors)
    - _Requirements: 1.3, 1.8, 1.9_
  
  - [ ] 1.2 Test member join real-time updates
    - User A: Open group dashboard in browser with DevTools Console open
    - User B: Join the same group from different browser/device
    - User A: Observe if member list updates without page refresh
    - **Expected Counterexample**: User A does not see User B join until page refresh (requires manual refresh)
    - Check User A's console for `member_joined` event receipt (should be missing or delayed 3+ seconds)
    - _Requirements: 1.1, 1.4, 1.6_
  
  - [ ] 1.3 Test message instant delivery
    - User A: Open group chat, send message, note timestamp in DevTools
    - User B: Open same group chat, observe when message appears
    - Measure latency using DevTools Network tab timestamps
    - **Expected Counterexample**: Message arrives 3-5 seconds later (polling interval) instead of sub-second
    - Check Network tab for polling requests instead of WebSocket frames
    - _Requirements: 1.2, 1.9_
  
  - [ ] 1.4 Test room join verification
    - User A: Connect to Socket.io and join a group
    - Server: Check logs for room join confirmation message
    - Server: Use `io.sockets.adapter.rooms.get('group:grp_123')` to verify client is in room
    - **Expected Counterexample**: Client socket ID is not in the room set, or auto-join query returns empty
    - Document if authentication token arrives after auto-join query executes (race condition)
    - _Requirements: 1.4, 1.6, 1.10_
  
  - [ ] 1.5 Test video call connection
    - User A: Start video call in a group
    - User B: Accept call from different network (different WiFi/mobile data)
    - Observe connection status and error messages
    - **Expected Counterexample**: Call fails with "Connection timeout" or "Unable to establish connection"
    - Document errors related to TURN/STUN servers, Stream.io credentials, or WebRTC negotiation
    - _Requirements: 1.5_
  
  - [ ] 1.6 Test reconnection room rejoin
    - User A: Join group, then simulate connection drop (airplane mode for 10 seconds)
    - User A: Re-enable connection and observe reconnection behavior in console
    - User B: Send message immediately while User A is reconnecting
    - **Expected Counterexample**: User A does not see User B's message after reconnecting (missed due to not rejoining room)
    - Check console logs for reconnect event but no subsequent `join_groups` emission
    - _Requirements: 1.7_
  
  - [ ] 1.7 Document findings and confirm root causes
    - Compile all counterexamples found in tests 1.1-1.6
    - Confirm or refute root cause hypotheses from design document
    - If root causes are refuted, document new hypotheses before proceeding to implementation
    - Create summary report of test failures to validate against after fixes

---

## Preservation Phase

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Functionality Must Remain Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy scenarios (localhost, REST APIs, fallback mechanisms)
  - Write tests capturing observed behavior patterns from Preservation Requirements
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  
  - [ ] 2.1 Test HTTP polling fallback preservation
    - Observe on UNFIXED code: Disable WebSocket in browser DevTools (Network conditions → disable WebSocket)
    - Document behavior: System falls back to HTTP polling with 3-second intervals
    - Write test: Verify polling requests occur at 3-second intervals when WebSocket unavailable
    - Run on UNFIXED code: **Expected PASS** (polling fallback currently works)
    - _Requirements: 3.1_
  
  - [ ] 2.2 Test REST API initial loading preservation
    - Observe on UNFIXED code: Load group dashboard, check Network tab for initial `GET /api/groups/:id`
    - Document behavior: Initial data loads via REST API before Socket.io subscription
    - Write test: Verify REST API request occurs on page load with correct timing and payload
    - Run on UNFIXED code: **Expected PASS** (REST API loading currently works)
    - _Requirements: 3.2_
  
  - [ ] 2.3 Test authentication middleware preservation
    - Observe on UNFIXED code: Connect with valid Firebase token, then connect without token (guest)
    - Document behavior: Both connections succeed, guests get `uid: 'guest_{socketId}'`
    - Write test: Verify authenticated and guest connections both succeed with correct ID format
    - Run on UNFIXED code: **Expected PASS** (authentication middleware currently works)
    - _Requirements: 3.3_
  
  - [ ] 2.4 Test event listener cleanup preservation
    - Observe on UNFIXED code: Subscribe to group updates, navigate away, check for memory leaks
    - Document behavior: Unsubscribe function removes all event listeners
    - Write test: Verify cleanup function removes listeners and prevents memory leaks
    - Run on UNFIXED code: **Expected PASS** (cleanup currently works)
    - _Requirements: 3.4_
  
  - [ ] 2.5 Test auto-join functionality preservation
    - Observe on UNFIXED code: User with 3 groups connects to Socket.io, check server logs
    - Document behavior: Server auto-joins user to all group rooms based on MongoDB query
    - Write test: Verify auto-join correctly identifies and joins all user's groups
    - Run on UNFIXED code: **Expected PASS** (auto-join currently works in localhost)
    - _Requirements: 3.5_
  
  - [ ] 2.6 Test message MongoDB persistence preservation
    - Observe on UNFIXED code: Send message via REST API, query MongoDB for saved document
    - Document behavior: Message is saved to MongoDB before Socket.io broadcast
    - Write test: Verify message persistence occurs with correct document structure and timing
    - Run on UNFIXED code: **Expected PASS** (persistence currently works)
    - _Requirements: 3.6, 3.7_
  
  - [ ] 2.7 Test CORS localhost and mobile preservation
    - Observe on UNFIXED code: Connect from `http://localhost:5173` and Capacitor mobile app
    - Document behavior: Both localhost and `capacitor://localhost` origins are allowed
    - Write test: Verify CORS allows development and mobile origins
    - Run on UNFIXED code: **Expected PASS** (localhost/mobile CORS currently works)
    - _Requirements: 3.8_
  
  - [ ] 2.8 Test existing event emissions preservation
    - Observe on UNFIXED code: Trigger spot updates, member removals, location shares
    - Document behavior: All events (`spots_updated`, `member_left`, `location_updated`) are emitted
    - Write test: Verify all existing event types continue broadcasting with correct payloads
    - Run on UNFIXED code: **Expected PASS** (event emissions currently work)
    - _Requirements: 3.9, 3.10_

---

## Implementation Phase

- [ ] 3. Fix Socket.io client configuration (socket.js)
  
  - [ ] 3.1 Enhance WebSocket transport priority
    - Open `pujoplan/client/src/services/socket.js`
    - Modify `getSocket()` function to add WebSocket-first transport configuration
    - Add transport upgrade preferences: `upgrade: true`, `rememberUpgrade: true`
    - Add connection reliability settings: `timeout: 20000`, `pingTimeout: 60000`, `pingInterval: 25000`
    - Add transport monitoring: log upgrades and transport changes
    - _Bug_Condition: isBugCondition(input) where input.action = 'connect_socket' AND input.transport ≠ 'websocket'_
    - _Expected_Behavior: Socket.io connection SHALL establish WebSocket transport successfully (Property 3)_
    - _Preservation: HTTP polling fallback SHALL continue to work when WebSocket unavailable (Property 7)_
    - _Requirements: 1.3, 1.8, 1.9, 2.3, 2.9, 3.1_
  
  - [ ] 3.2 Improve reconnection room rejoin logic
    - In `socket.js`, enhance the `socket.on('connect')` handler
    - Ensure `allJoinedGroupIds` set is always maintained correctly
    - Add logic to always rejoin rooms from `allJoinedGroupIds` on reconnect
    - Add fallback to rejoin `currentGroupId` if set is empty
    - Add console logging for reconnection and room rejoin operations
    - _Bug_Condition: isBugCondition(input) where input.action = 'reconnect' AND input.roomsRejoined = false_
    - _Expected_Behavior: Client SHALL automatically rejoin all group rooms after reconnection (Property 6)_
    - _Preservation: Event listener cleanup SHALL continue to work correctly (Property 9)_
    - _Requirements: 1.7, 2.7, 3.4_
  
  - [ ] 3.3 Add transport monitoring and logging
    - Add `socket.io.engine.on('upgrade')` listener to log successful WebSocket upgrades
    - Add `socket.io.engine.on('close')` listener to log transport closures
    - Enhance connection logging to show transport type on connect
    - _Bug_Condition: Aids debugging of transport issues identified in bug condition_
    - _Expected_Behavior: Provides visibility into WebSocket upgrade success/failure_
    - _Requirements: 1.3, 1.9_
  
  - [ ] 3.4 Implement token refresh mechanism
    - Create `updateSocketAuthToken(token)` function in `socket.js`
    - Function should update `socket.auth` with new token and reconnect
    - Export function for use by authentication components
    - _Bug_Condition: Addresses race condition where token is unavailable during initial connect_
    - _Expected_Behavior: Socket can reconnect with fresh authentication token_
    - _Preservation: Authentication middleware SHALL continue to work for both authenticated and guest users (Property 9)_
    - _Requirements: 1.4, 3.3_

- [ ] 4. Fix Socket.io server configuration (socketService.js)
  
  - [ ] 4.1 Improve CORS configuration for production
    - Open `pujoplan/server/services/socketService.js`
    - Modify `initSocket()` CORS configuration to explicitly allow Netlify and Render domains
    - Add allowedOrigins array including production URLs
    - Add WebSocket-specific settings: `upgradeTimeout: 30000`, `maxHttpBufferSize: 1e6`
    - _Bug_Condition: isBugCondition(input) where input.corsConfigured = false AND input.networkEnvironment = 'production_web'_
    - _Expected_Behavior: CORS SHALL properly allow Socket.io connections from Netlify (Property 3)_
    - _Preservation: CORS SHALL continue to allow localhost and mobile origins (Property 7, 8)_
    - _Requirements: 1.3, 1.8, 2.8, 3.8_
  
  - [ ] 4.2 Add room join logging
    - In `socketService.js`, enhance `socket.on('join_group')` handler
    - Add console log when client joins room: socket ID, user name, room name
    - Add log showing all active rooms for the socket after join
    - _Bug_Condition: Aids debugging of room join failures (input.roomJoined = false)_
    - _Expected_Behavior: Provides visibility into room membership for debugging_
    - _Requirements: 1.4, 1.6, 1.10_
  
  - [ ] 4.3 Add event emission logging
    - In `socketService.js`, modify `emitGroupUpdate()` function
    - Add logging that shows: event name, room name, number of clients in room
    - Add warning when emitting to empty room (no clients to receive)
    - Add error logging when io is not initialized or groupId is missing
    - _Bug_Condition: Aids debugging of event delivery failures (input.action = 'emit_event')_
    - _Expected_Behavior: Provides visibility into event broadcast success/failure_
    - _Preservation: All existing event emissions SHALL continue to work (Property 8)_
    - _Requirements: 1.4, 1.6, 2.6, 3.9, 3.10_

- [ ] 5. Fix CORS and Express configuration (server.js)
  
  - [ ] 5.1 Add Netlify URL to ALLOWED_ORIGINS
    - Open `pujoplan/server/server.js`
    - Add `'https://pujoplan.netlify.app'` to ALLOWED_ORIGINS array
    - Add `'https://uma-asche.onrender.com'` to ALLOWED_ORIGINS array
    - Ensure CLIENT_URL environment variable is included
    - _Bug_Condition: isBugCondition(input) where input.corsConfigured = false_
    - _Expected_Behavior: Production frontend SHALL be explicitly allowed in CORS (Property 3)_
    - _Preservation: Localhost and mobile CORS SHALL continue to work (Property 8)_
    - _Requirements: 1.8, 2.8, 3.8_
  
  - [ ] 5.2 Add environment variable validation logging
    - In `server.js`, enhance server startup logging
    - Log CLIENT_URL, NODE_ENV, ALLOWED_ORIGINS on server start
    - Log Socket.io transport configuration
    - _Expected_Behavior: Provides visibility into server configuration for debugging_
    - _Requirements: 1.8, 2.8_

- [ ] 6. Fix Stream.io configuration (callController.js)
  
  - [ ] 6.1 Add environment variable validation
    - Open `pujoplan/server/controllers/callController.js`
    - Add console warning if STREAM_API_KEY or STREAM_API_SECRET are not set (using defaults)
    - Document in comments that production should have these environment variables set
    - _Bug_Condition: isBugCondition(input) where input.action = 'start_video_call' AND input.connectionEstablished = false_
    - _Expected_Behavior: Warning alerts developers to missing production credentials_
    - _Requirements: 1.5, 2.5_
  
  - [ ] 6.2 Add error handling for Stream.io operations
    - Wrap `call.getOrCreate()` in try-catch block
    - Log detailed error information including error message and code
    - Allow operation to continue (client can still attempt to join)
    - _Bug_Condition: Improves visibility into Stream.io failures_
    - _Expected_Behavior: Stream.io errors are logged and don't crash the server_
    - _Requirements: 1.5, 2.5_

- [ ] 7. Configure deployment environment variables
  
  - [ ] 7.1 Set Render.com environment variables
    - Log into Render.com dashboard for uma-asche backend service
    - Verify/set these environment variables:
      - `NODE_ENV=production`
      - `CLIENT_URL=https://pujoplan.netlify.app`
      - `STREAM_API_KEY=<your_production_key>`
      - `STREAM_API_SECRET=<your_production_secret>`
      - Verify MongoDB, Firebase credentials are present
    - Restart the Render.com service after setting variables
    - Check logs for confirmation: "Frontend (CLIENT_URL) → https://pujoplan.netlify.app"
    - _Bug_Condition: Missing environment variables cause connection failures_
    - _Expected_Behavior: Production environment properly configured_
    - _Requirements: 1.3, 1.5, 1.8, 2.3, 2.5, 2.8_
  
  - [ ] 7.2 Verify Netlify environment variables
    - Log into Netlify dashboard
    - Verify these environment variables are set:
      - `VITE_API_URL=https://uma-asche.onrender.com/api`
      - `VITE_GEMINI_API_KEY=<your_key>`
    - Redeploy if any variables were changed
    - _Expected_Behavior: Frontend properly configured to connect to backend_
    - _Requirements: 1.3, 2.3_

- [ ] 8. Verification: Run bug condition exploration tests on FIXED code
  
  - [ ] 8.1 Verify WebSocket transport establishment
    - **Property 1: Expected Behavior** - WebSocket Connection Establishment
    - **IMPORTANT**: Re-run the SAME test from task 1.1 - do NOT write a new test
    - Deploy FIXED code to production (Netlify + Render)
    - Open Netlify app in DevTools Network → WS tab
    - **EXPECTED OUTCOME**: Test PASSES - Socket.io uses "websocket" transport
    - Assert: Console shows "Transport: websocket" and "Upgraded to: websocket"
    - Assert: No CORS errors or transport failures
    - _Requirements: 2.3, 2.8, 2.9_
  
  - [ ] 8.2 Verify member join real-time updates
    - **Property 1: Expected Behavior** - Real-Time Member List Updates
    - **IMPORTANT**: Re-run the SAME test from task 1.2 - do NOT write a new test
    - User A: Open group dashboard with DevTools Console
    - User B: Join group from different browser
    - **EXPECTED OUTCOME**: Test PASSES - User A sees member list update without refresh
    - Assert: Console shows `member_joined` event received within 1 second
    - Assert: Server logs show "Emitting 'member_joined' to room 'group:X' (N clients)"
    - _Requirements: 2.1, 2.4, 2.6_
  
  - [ ] 8.3 Verify message instant delivery
    - **Property 1: Expected Behavior** - Instant Message Delivery
    - **IMPORTANT**: Re-run the SAME test from task 1.3 - do NOT write a new test
    - User A: Send message with DevTools Performance tab recording
    - User B: Observe message receipt with timestamps
    - **EXPECTED OUTCOME**: Test PASSES - Message latency < 1 second
    - Assert: Message arrives via WebSocket frame, not HTTP polling
    - Assert: Performance timeline shows sub-second delivery
    - _Requirements: 2.2, 2.3, 2.9_
  
  - [ ] 8.4 Verify room join success
    - **Property 1: Expected Behavior** - Event Delivery via Room Join
    - **IMPORTANT**: Re-run the SAME test from task 1.4 - do NOT write a new test
    - User connects and joins group
    - Server: Check logs for room join confirmation
    - **EXPECTED OUTCOME**: Test PASSES - Client is in room
    - Assert: `io.sockets.adapter.rooms.get('group:X').has(socket.id)` returns true
    - Assert: Server logs show "Active rooms for {socketId}: [socket.id, group:X]"
    - _Requirements: 2.4, 2.6, 2.10_
  
  - [ ] 8.5 Verify video call connection
    - **Property 1: Expected Behavior** - Video Call Connection
    - **IMPORTANT**: Re-run the SAME test from task 1.5 - do NOT write a new test
    - User A: Start video call
    - User B: Accept call from different network
    - **EXPECTED OUTCOME**: Test PASSES - Call connects successfully
    - Assert: WebRTC connection establishes within 10 seconds
    - Assert: Audio and video streams are transmitted
    - Assert: No connection timeout or TURN/STUN errors
    - _Requirements: 2.5_
  
  - [ ] 8.6 Verify reconnection room rejoin
    - **Property 1: Expected Behavior** - Reconnection Room Rejoin
    - **IMPORTANT**: Re-run the SAME test from task 1.6 - do NOT write a new test
    - User A: Join group, disconnect (airplane mode 10 seconds), reconnect
    - User B: Send message after User A reconnects
    - **EXPECTED OUTCOME**: Test PASSES - User A receives message
    - Assert: Console shows "Rejoining N rooms after reconnect"
    - Assert: User A receives User B's message (proves room rejoin worked)
    - _Requirements: 2.7_

- [ ] 9. Verification: Run preservation tests on FIXED code
  
  - [ ] 9.1 Verify HTTP polling fallback still works
    - **Property 2: Preservation** - HTTP Polling Fallback
    - **IMPORTANT**: Re-run the SAME test from task 2.1 - do NOT write a new test
    - Disable WebSocket in browser DevTools
    - **EXPECTED OUTCOME**: Test PASSES - Polling fallback still works
    - Assert: HTTP polling occurs at 3-second intervals
    - Assert: System continues to function without WebSocket
    - _Requirements: 3.1_
  
  - [ ] 9.2 Verify REST API initial loading still works
    - **Property 2: Preservation** - REST API Initial Loading
    - **IMPORTANT**: Re-run the SAME test from task 2.2 - do NOT write a new test
    - Load group dashboard, check Network tab
    - **EXPECTED OUTCOME**: Test PASSES - REST API loading unchanged
    - Assert: Initial `GET /api/groups/:id` request occurs
    - Assert: Same timing and payload as before fix
    - _Requirements: 3.2_
  
  - [ ] 9.3 Verify authentication middleware still works
    - **Property 2: Preservation** - Authentication and Cleanup
    - **IMPORTANT**: Re-run the SAME test from task 2.3 - do NOT write a new test
    - Connect with Firebase token and without (guest)
    - **EXPECTED OUTCOME**: Test PASSES - Authentication unchanged
    - Assert: Both authenticated and guest connections succeed
    - Assert: Guest ID format remains `uid: 'guest_{socketId}'`
    - _Requirements: 3.3_
  
  - [ ] 9.4 Verify event listener cleanup still works
    - **Property 2: Preservation** - Authentication and Cleanup
    - **IMPORTANT**: Re-run the SAME test from task 2.4 - do NOT write a new test
    - Subscribe to group updates, navigate away, check for memory leaks
    - **EXPECTED OUTCOME**: Test PASSES - Cleanup unchanged
    - Assert: Unsubscribe function removes all listeners
    - Assert: No memory leaks detected
    - _Requirements: 3.4_
  
  - [ ] 9.5 Verify auto-join functionality still works
    - **Property 2: Preservation** - REST API Initial Loading
    - **IMPORTANT**: Re-run the SAME test from task 2.5 - do NOT write a new test
    - User with 3 groups connects to Socket.io
    - **EXPECTED OUTCOME**: Test PASSES - Auto-join unchanged
    - Assert: Server auto-joins user to all 3 group rooms
    - Assert: Same MongoDB query executed
    - _Requirements: 3.5_
  
  - [ ] 9.6 Verify message persistence still works
    - **Property 2: Preservation** - REST API Initial Loading
    - **IMPORTANT**: Re-run the SAME test from task 2.6 - do NOT write a new test
    - Send message via REST API, query MongoDB
    - **EXPECTED OUTCOME**: Test PASSES - Persistence unchanged
    - Assert: Message saved to MongoDB before Socket.io broadcast
    - Assert: Same document structure and timing
    - _Requirements: 3.6, 3.7_
  
  - [ ] 9.7 Verify CORS for localhost and mobile still works
    - **Property 2: Preservation** - HTTP Polling Fallback
    - **IMPORTANT**: Re-run the SAME test from task 2.7 - do NOT write a new test
    - Connect from localhost and Capacitor mobile app
    - **EXPECTED OUTCOME**: Test PASSES - CORS unchanged
    - Assert: Both localhost and capacitor:// origins allowed
    - Assert: Development and mobile functionality preserved
    - _Requirements: 3.8_
  
  - [ ] 9.8 Verify existing event emissions still work
    - **Property 2: Preservation** - HTTP Polling Fallback
    - **IMPORTANT**: Re-run the SAME test from task 2.8 - do NOT write a new test
    - Trigger spot updates, member removals, location shares
    - **EXPECTED OUTCOME**: Test PASSES - Event emissions unchanged
    - Assert: All event types broadcast correctly
    - Assert: Same payloads and behavior as before fix
    - _Requirements: 3.9, 3.10_

---

## Final Checkpoint

- [ ] 10. Checkpoint - Ensure all tests pass
  - Verify all bug condition tests (8.1-8.6) pass on FIXED code
  - Verify all preservation tests (9.1-9.8) pass on FIXED code
  - Test across multiple browsers (Chrome, Firefox, Safari) and networks (WiFi, mobile data)
  - Test on both desktop and mobile devices
  - Monitor server logs for any errors or warnings
  - If any test fails, investigate root cause and address before marking complete
  - Ask the user if questions arise or if additional testing is needed
