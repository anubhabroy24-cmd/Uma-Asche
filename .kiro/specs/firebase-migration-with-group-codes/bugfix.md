# Bugfix Requirements Document

## Introduction

PujoPlan currently experiences severe performance issues with group fetching, taking 5-10 seconds or up to 60 seconds when the Render.com backend is sleeping (cold start). The root cause is the architectural dependency on MongoDB Atlas + Render.com backend REST API, which requires multiple round trips (App → Render.com → MongoDB → Render.com → App) and lacks real-time synchronization capabilities.

The application already has Firebase Authentication and Firebase SDK configured (project ID: `plucky-dryad-477507-s3`), but group data is still stored in MongoDB. This creates a hybrid architecture that doesn't leverage Firebase's real-time capabilities and suffers from backend cold starts.

This bugfix migrates group data storage from MongoDB Atlas to Firebase Firestore with real-time listeners, introduces a 6-digit alphanumeric group code system for easy joining, and eliminates the dependency on Render.com backend for data fetching, reducing group load time from 5-60 seconds to under 1 second.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user opens the app and tries to fetch their groups THEN the system takes 5-10 seconds to load group data through REST API calls to Render.com backend

1.2 WHEN the Render.com backend is sleeping (inactive for >15 minutes) THEN the system takes 30-60 seconds for cold start before responding to group fetch requests

1.3 WHEN a group is updated (new member, message, spot added) THEN other users do not see the update until they manually refresh or poll the backend API

1.4 WHEN users are on different networks (WiFi vs mobile data) THEN real-time updates depend on Socket.io connection to Render.com backend, which may fail or experience high latency

1.5 WHEN a user wants to join a group THEN they need to use a long invite token (e.g., "PJ_eyJpZCI6Imdyc...") which is difficult to share verbally or via SMS

1.6 WHEN multiple users interact with a group simultaneously THEN updates require REST API polling or Socket.io events through the backend, causing 2-5 second delays

1.7 WHEN the app loads group data THEN it makes sequential REST calls (fetch groups → fetch each group's details → fetch members → fetch messages), multiplying latency

1.8 WHEN users sign out and re-login THEN the system must rebuild the entire user-group relationship by querying MongoDB through the backend

1.9 WHEN group chat messages are sent THEN they route through Render.com backend (App → Render.com → MongoDB → Render.com → Socket.io → Other Clients), adding 1-3 seconds of latency

1.10 WHEN the app is offline THEN no cached data is available because MongoDB data is not cached locally

1.11 WHEN a group is created THEN the system generates a complex portable invite token instead of a simple memorable code

1.12 WHEN backend API returns HTML (due to SPA fallback) THEN the app falls back to localStorage-based persistence which causes data inconsistency across devices

### Expected Behavior (Correct)

2.1 WHEN a user opens the app and tries to fetch their groups THEN the system SHALL load group data within 1 second using Firebase Firestore real-time listeners without REST API calls

2.2 WHEN the app starts THEN the system SHALL connect directly to Firebase Firestore without requiring Render.com backend, eliminating cold start delays

2.3 WHEN a group is updated (new member, message, spot added) THEN the system SHALL push updates to all group members within 500ms via Firestore real-time listeners

2.4 WHEN users are on different networks THEN the system SHALL use Firebase Firestore real-time listeners which work seamlessly across all network types without Socket.io

2.5 WHEN a user wants to join a group THEN the system SHALL provide a 6-digit alphanumeric code (e.g., "A1B2C3") that can be easily shared verbally, via SMS, or in URLs

2.6 WHEN multiple users interact with a group simultaneously THEN the system SHALL deliver updates instantly via Firestore listeners with sub-second latency

2.7 WHEN the app loads group data THEN the system SHALL fetch all group information in parallel using Firestore queries and real-time listeners in a single round trip

2.8 WHEN users sign out and re-login THEN the system SHALL retrieve user-group relationships instantly by querying the user's `groups` array field in their Firestore user document

2.9 WHEN group chat messages are sent THEN the system SHALL store them directly in Firestore subcollection `groups/{groupId}/messages/{messageId}` and notify members via real-time listeners within 500ms

2.10 WHEN the app is offline THEN the system SHALL provide cached Firestore data using Firebase offline persistence

2.11 WHEN a group is created THEN the system SHALL generate a unique 6-digit alphanumeric code (uppercase A-Z and 0-9) that serves as both groupId and join code

2.12 WHEN backend API is unavailable THEN the system SHALL operate fully using Firebase Firestore without localStorage fallbacks, ensuring data consistency across devices

### Unchanged Behavior (Regression Prevention)

3.1 WHEN users authenticate THEN the system SHALL CONTINUE TO use Firebase Authentication with Google Sign-In as currently implemented

3.2 WHEN video calls are initiated THEN the system SHALL CONTINUE TO use Stream.io for video calling functionality

3.3 WHEN users view pandal spots from the default dataset THEN the system SHALL CONTINUE TO load spots from the DEFAULT_PANDALS array

3.4 WHEN routes are calculated THEN the system SHALL CONTINUE TO use the nearest neighbor algorithm (solveNearestNeighbor) for route optimization

3.5 WHEN user profile data (name, email, photoURL) is updated THEN the system SHALL CONTINUE TO sync with Firebase Authentication user profile

3.6 WHEN users access the app on native mobile (Capacitor) THEN the system SHALL CONTINUE TO use @codetrix-studio/capacitor-google-auth for native authentication

3.7 WHEN the app displays the UI THEN the system SHALL CONTINUE TO use React + React Router for navigation and component rendering

3.8 WHEN admin removes a member from a group THEN the system SHALL CONTINUE TO restrict this action to users with admin role

3.9 WHEN a user leaves a group THEN the system SHALL CONTINUE TO remove them from the group's member list

3.10 WHEN spots are added to a group THEN the system SHALL CONTINUE TO include spot metadata (name, area, region, coordinates, images, category, crowdLevel, bestTimeToVisit, nearestMetro)

3.11 WHEN users vote on a spot THEN the system SHALL CONTINUE TO track vote counts and allow users to toggle their vote

3.12 WHEN a spot is finalized THEN the system SHALL CONTINUE TO change its status from "suggested" to "finalized"

## Bug Condition Analysis

### Bug Condition Function

The bug condition identifies when the slow loading and poor real-time synchronization occurs:

```pascal
FUNCTION isBugCondition(request)
  INPUT: request containing operation type and current architecture
  OUTPUT: boolean
  
  // Bug occurs when using MongoDB + Render.com backend for group operations
  RETURN (
    request.operation IN ['fetchGroups', 'fetchGroupById', 'createGroup', 'joinGroup', 'sendMessage', 'addMember', 'addSpot', 'realTimeUpdate'] 
    AND 
    request.architecture = 'MongoDB_Render_Backend'
  )
END FUNCTION
```

**Examples of Bug Condition:**
- `isBugCondition({operation: 'fetchGroups', architecture: 'MongoDB_Render_Backend'})` → **true** (5-60 second load time)
- `isBugCondition({operation: 'sendMessage', architecture: 'MongoDB_Render_Backend'})` → **true** (1-3 second latency via Socket.io)
- `isBugCondition({operation: 'fetchGroups', architecture: 'Firebase_Firestore'})` → **false** (sub-second load with real-time)

### Property Specification

**Property: Fix Checking - Fast Group Operations with Real-Time Sync**

```pascal
FOR ALL operations WHERE isBugCondition(operation) DO
  result ← executeWithFirestore(operation)
  
  ASSERT result.loadTime < 1000ms  // Groups load in under 1 second
  ASSERT result.realtimeLatency < 500ms  // Updates pushed within 500ms
  ASSERT result.requiresBackend = false  // No Render.com dependency
  ASSERT result.groupCodeFormat = '[A-Z0-9]{6}'  // 6-digit codes
  ASSERT result.offlineCacheAvailable = true  // Firebase offline persistence
END FOR
```

**Preservation Goal - Existing Functionality Unchanged**

```pascal
FOR ALL operations WHERE NOT isBugCondition(operation) DO
  // F = original function, F' = fixed function with Firestore
  ASSERT F'(operation) = F(operation)
  
  // Specifically:
  ASSERT authentication_method_unchanged
  ASSERT video_calling_unchanged  // Stream.io
  ASSERT route_optimization_unchanged  // solveNearestNeighbor
  ASSERT spot_dataset_unchanged  // DEFAULT_PANDALS
  ASSERT UI_rendering_unchanged  // React + Router
  ASSERT permission_logic_unchanged  // Admin/member roles
END FOR
```

## Migration Strategy Summary

**From:** MongoDB Atlas (REST API) → Render.com Backend → Socket.io → App  
**To:** Firebase Firestore (real-time listeners) → App

**Key Changes:**
1. **Database:** MongoDB Atlas → Firebase Firestore collections
2. **Group ID:** Long portable tokens → 6-digit alphanumeric codes (e.g., "A1B2C3")
3. **Fetching:** REST API calls via axios → Firestore queries with real-time listeners
4. **Real-time:** Socket.io through backend → Firestore `onSnapshot` listeners
5. **Backend:** Required for all data operations → Optional (only for complex operations if needed)
6. **Chat:** MongoDB messages + Socket.io → Firestore subcollections with real-time listeners
7. **Offline:** No caching → Firebase offline persistence enabled

**Firestore Schema:**
```
users/{userId}
  - name, email, photoURL, groups: [groupId1, groupId2, ...]

groups/{groupId}  // groupId is the 6-digit code
  - name, adminId, adminInfo, members: [...], spots: [...], createdAt, updatedAt
  
  groups/{groupId}/messages/{messageId}
    - text, senderId, senderName, senderImage, createdAt, type, imageUrl
```

**Performance Target:**
- Current: 5-60 seconds (with cold starts)
- Target: <1 second (Firestore real-time)
- Real-time updates: <500ms latency
